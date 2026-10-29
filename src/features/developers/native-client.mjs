// Node.js 22+. Keep the Secret as its original UTF-8 text.
import { createHash, createHmac } from "node:crypto"
import { pathToFileURL } from "node:url"

export function nativeSignature(secret, method, path, query, body = "") {
  const parameters = new URLSearchParams(query)
  parameters.delete("signature")
  parameters.sort()
  const digest = createHash("sha256").update(body).digest("hex")
  return createHmac("sha256", secret)
    .update(`${method.toUpperCase()}\n${path}\n${parameters}\n${digest}`)
    .digest("hex")
}

export async function readBalances({ baseUrl, apiKey, secret, productLine }) {
  const time = await fetch(new URL("/api/v1/time", baseUrl), {
    signal: AbortSignal.timeout(10_000),
  })
  if (!time.ok) throw new Error(`Clock request failed: HTTP ${time.status}`)
  const { serverTime } = await time.json()
  const path = "/api/v1/gateway/account/balances"
  const query = new URLSearchParams({
    productLine,
    timestamp: String(serverTime),
    recvWindow: "5000",
  })
  query.set("signature", nativeSignature(secret, "GET", path, query))
  const url = new URL(path, baseUrl)
  url.search = query.toString()
  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey },
    signal: AbortSignal.timeout(10_000),
  })
  // Do not JSON.parse financial int64 values into JavaScript Number.
  const body = await response.text()
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}; Retry-After=${response.headers.get("Retry-After") ?? "none"}; ${body}`,
    )
  return body
}

export function watchAccount({ wsUrl, apiKey, secret, productLine }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const lifetime = setTimeout(() => socket.close(1000, "example finished"), 60_000)
    let heartbeat
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ op: "apiChallenge", id: "challenge" }))
      heartbeat = setInterval(
        () => socket.send(JSON.stringify({ op: "ping", id: "heartbeat" })),
        20_000,
      )
    })
    socket.addEventListener("message", ({ data }) => {
      // Inspect only envelope metadata. Keep all financial payloads as raw text.
      const envelope = JSON.parse(String(data))
      if (envelope.op === "apiChallenge") {
        const timestamp = Date.now()
        const signature = createHmac("sha256", secret)
          .update(`WS\n/ws/v1\n${envelope.data.challenge}\n${apiKey}\n${timestamp}`)
          .digest("hex")
        socket.send(
          JSON.stringify({ op: "authenticateApiKey", id: "auth", apiKey, timestamp, signature }),
        )
      } else if (envelope.op === "authenticated") {
        socket.send(
          JSON.stringify({ op: "subscribe", id: "account", channel: "accountState", productLine }),
        )
      }
      console.log(String(data))
    })
    socket.addEventListener("error", () => socket.close())
    socket.addEventListener("close", ({ code, reason }) => {
      clearTimeout(lifetime)
      clearInterval(heartbeat)
      if (code === 1000) resolve()
      else
        reject(
          new Error(
            `WebSocket closed: ${code} ${reason}; reconnect with bounded backoff, then authenticate and subscribe again`,
          ),
        )
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { API_BASE_URL, API_KEY, API_SECRET, PRODUCT_LINE = "SPOT", MODE = "rest" } = process.env
  if (!API_BASE_URL || !API_KEY || !API_SECRET)
    throw new Error("Set API_BASE_URL, API_KEY and API_SECRET")
  const settings = {
    baseUrl: API_BASE_URL,
    apiKey: API_KEY,
    secret: API_SECRET,
    productLine: PRODUCT_LINE,
  }
  if (MODE === "rest") console.log(await readBalances(settings))
  else if (MODE === "ws") {
    const url = new URL("/ws/v1", API_BASE_URL)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    await watchAccount({ ...settings, wsUrl: url.toString() })
  } else throw new Error("MODE must be rest or ws")
}
