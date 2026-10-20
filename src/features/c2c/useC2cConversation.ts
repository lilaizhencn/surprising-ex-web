import { useCallback, useEffect, useRef, useState } from "react"
import {
  type C2cConversation,
  type C2cEvent,
  type C2cMessage,
  type C2cPage,
  C2cPageSchema,
  loadC2cMessages,
  mergeC2cMessages,
  readC2cMessages,
} from "../../api/c2c"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import type { RealtimeConnectionHandle } from "../../sharedRealtimeConnections"
import { acquireRealtimeConnections } from "../../sharedRealtimeConnections"

export function c2cCursor(values: readonly string[]) {
  return values.reduce((max, value) => (BigInt(value) > BigInt(max) ? value : max), "0")
}

export function mergeC2cEvents(previous: readonly C2cEvent[], incoming: readonly C2cEvent[]) {
  return [
    ...new Map([...previous, ...incoming].map((event) => [event.eventId, event])).values(),
  ].sort((a, b) => (BigInt(a.eventId) < BigInt(b.eventId) ? -1 : 1))
}

/** A page owns subscriptions only; the application keeps the one authenticated socket. */
export function useC2cConversation(owner: string, token: string, conversation: C2cConversation) {
  const id = conversation.conversationId
  const [messages, setMessages] = useState<C2cMessage[]>([])
  const [events, setEvents] = useState<C2cEvent[]>([])
  const [reads, setReads] = useState<C2cPage["reads"]>([])
  const [currentConversation, setCurrentConversation] = useState(conversation)
  const [loading, setLoading] = useState(true)
  const [older, setOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const cursor = useRef({ message: "0", event: "0" })
  const handle = useRef<RealtimeConnectionHandle | null>(null)
  const active = useRef(true)
  const readPosition = useRef({ message: "0", event: "0" })
  const requestedRead = useRef({ message: "0", event: "0" })
  const reading = useRef(false)
  const initialized = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const accept = useCallback(
    (page: C2cPage) => {
      if (!active.current || page.conversationId !== id) return
      setMessages((previous) => mergeC2cMessages(previous, page.messages))
      if (page.conversation) setCurrentConversation(page.conversation)
      setEvents((previous) => mergeC2cEvents(previous, page.orderEvents))
      setReads((previous) => {
        const next = new Map(previous.map((read) => [read.userId, read]))
        for (const read of page.reads) {
          const current = next.get(read.userId)
          if (!current || BigInt(read.revision) >= BigInt(current.revision))
            next.set(read.userId, read)
        }
        return [...next.values()]
      })
      cursor.current = {
        message: c2cCursor([cursor.current.message, ...page.messages.map((m) => m.messageId)]),
        event: c2cCursor([cursor.current.event, ...page.orderEvents.map((e) => e.eventId)]),
      }
      handle.current?.update([
        { channel: "c2c.inbox" },
        {
          channel: "c2c.messages",
          conversationId: id,
          after: cursor.current.message,
          afterEvent: cursor.current.event,
        },
      ])
    },
    [id],
  )

  // Fetch a bounded recent baseline first, then resume strictly after its highest IDs.
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setError("")
    const initial = !initialized.current
    const options = initial
      ? { latest: true }
      : { after: cursor.current.message, afterEvent: cursor.current.event }
    void loadC2cMessages(owner, id, { ...options, signal: abort.signal })
      .then((page) => {
        if (abort.signal.aborted) return
        accept(page)
        if (initial) setHasOlder(page.hasMore)
        initialized.current = true
        setLoading(false)
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t("Unable to load messages."))
          setLoading(false)
        }
      })
    return () => abort.abort()
  }, [owner, id, accept, attempt])

  useEffect(() => {
    if (loading || error) return
    const socket = acquireRealtimeConnections(
      config.wsBaseUrlForProductLine,
      token,
      (event) => {
        if (event.op === "c2c.error") {
          setError(t("Chat subscription failed. Please retry."))
          return
        }
        if (event.op !== "c2c.messages") return
        const result = C2cPageSchema.safeParse(event.data)
        if (result.success) accept(result.data)
        else setError(t("Unable to read the chat update. Please retry."))
      },
      (_products, connected) => setLive(connected),
    )
    handle.current = socket
    socket.update([
      { channel: "c2c.inbox" },
      {
        channel: "c2c.messages",
        conversationId: id,
        after: cursor.current.message,
        afterEvent: cursor.current.event,
      },
    ])
    return () => {
      handle.current = null
      socket.close()
    }
  }, [token, id, accept, loading, error])

  const loadOlder = async (beforeInsert: () => void) => {
    const first = messages[0]
    if (!first || older || !hasOlder) return
    setOlder(true)
    try {
      const page = await loadC2cMessages(owner, id, { before: first.messageId })
      if (active.current) {
        beforeInsert()
        accept(page)
        setHasOlder(page.hasMore)
      }
    } catch (failure) {
      if (active.current)
        setError(failure instanceof Error ? failure.message : t("Unable to load messages."))
    } finally {
      if (active.current) setOlder(false)
    }
  }

  const markRead = useCallback(async () => {
    const position = { ...cursor.current }
    if (
      position.message === readPosition.current.message &&
      position.event === readPosition.current.event
    )
      return
    requestedRead.current = position
    if (reading.current) return
    reading.current = true
    try {
      while (
        active.current &&
        (requestedRead.current.message !== readPosition.current.message ||
          requestedRead.current.event !== readPosition.current.event)
      ) {
        const next = { ...requestedRead.current }
        await readC2cMessages(owner, id, next.message, next.event)
        if (active.current) readPosition.current = next
      }
    } catch {
      /* Keep the cursor unchanged; the next visible update can retry. */
    } finally {
      reading.current = false
    }
  }, [owner, id])

  const sent = (message: C2cMessage) => {
    if (active.current) setMessages((previous) => mergeC2cMessages(previous, [message]))
    // Do not advance the resume cursor using a send response: another user's earlier
    // committed message may still be in transit on the socket.
  }
  return {
    messages,
    events,
    reads,
    currentConversation,
    loading,
    older,
    hasOlder,
    live,
    error,
    loadOlder,
    markRead,
    sent,
    retry: () => {
      setError("")
      setAttempt((value) => value + 1)
    },
  }
}
