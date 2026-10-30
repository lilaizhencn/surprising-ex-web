import DOMPurify from "dompurify"
import { memo, useMemo } from "react"

export function sanitizeArticle(html: string): string {
  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "h2",
      "h3",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "ul",
      "ol",
      "li",
      "hr",
      "code",
      "pre",
      "a",
      "img",
      "audio",
      "video",
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "src",
      "alt",
      "loading",
      "decoding",
      "controls",
      "preload",
      "playsinline",
    ],
    ALLOW_DATA_ATTR: false,
  })
  const document = new DOMParser().parseFromString(cleaned, "text/html")
  for (const media of document.querySelectorAll("img,audio,video")) {
    const source = media.getAttribute("src") ?? ""
    const publicMedia =
      /^https:\/\/cdn\.surprising\.top\/public\/exchange\/content\/[0-9a-f-]{36}\.(?:jpg|png|gif|webp|mp3|m4a|wav|mp4)$/.test(
        source,
      )
    if (!publicMedia) {
      media.remove()
      continue
    }
    if (media.tagName === "IMG") {
      media.setAttribute("loading", "lazy")
      media.setAttribute("decoding", "async")
    } else {
      media.setAttribute("controls", "")
      media.setAttribute("preload", "metadata")
      media.setAttribute("playsinline", "")
    }
  }
  for (const link of document.querySelectorAll("a")) {
    if (!/^(https:\/\/|mailto:)/i.test(link.getAttribute("href") ?? ""))
      link.removeAttribute("href")
    link.setAttribute("target", "_blank")
    link.setAttribute("rel", "noopener noreferrer nofollow")
  }
  return document.body.innerHTML
}
export const ArticleView = memo(function ArticleView({
  html,
  text,
  locale,
}: {
  readonly html?: string | null | undefined
  readonly text: string
  readonly locale?: string | null | undefined
}) {
  const safe = useMemo(() => (html ? sanitizeArticle(html) : null), [html])
  return safe ? (
    <div
      className="announcement-body article-rich"
      lang={locale ?? undefined}
      dir={locale?.startsWith("ar") ? "rtl" : "auto"}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify and managed-media validation sanitize the article above.
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  ) : (
    <div className="announcement-body" lang={locale ?? undefined} dir="auto">
      {text}
    </div>
  )
})
