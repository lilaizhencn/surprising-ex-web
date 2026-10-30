export const LOCALES = [
  { code: "en", tag: "en-US", label: "English", compact: "EN" },
  { code: "zh", tag: "zh-CN", label: "简体中文", compact: "简中" },
  { code: "zh-TW", tag: "zh-TW", label: "繁體中文", compact: "繁中" },
  { code: "es", tag: "es-ES", label: "Español", compact: "ES" },
  { code: "fr", tag: "fr-FR", label: "Français", compact: "FR" },
  { code: "de", tag: "de-DE", label: "Deutsch", compact: "DE" },
  { code: "pt", tag: "pt-BR", label: "Português (Brasil)", compact: "PT" },
  { code: "ru", tag: "ru-RU", label: "Русский", compact: "RU" },
  { code: "ar", tag: "ar-SA", label: "العربية", compact: "ع" },
  { code: "ja", tag: "ja-JP", label: "日本語", compact: "日本" },
  { code: "ko", tag: "ko-KR", label: "한국어", compact: "한국" },
  { code: "hi", tag: "hi-IN", label: "हिन्दी", compact: "हि" },
] as const
export type Locale = (typeof LOCALES)[number]["code"]
export function normalizeLocale(value: string | null | undefined): Locale {
  const exact = LOCALES.find(
    (item) =>
      item.code.toLowerCase() === value?.toLowerCase() ||
      item.tag.toLowerCase() === value?.toLowerCase(),
  )
  if (exact) return exact.code
  if (/^zh[-_](?:hant|hk|mo|tw)/i.test(value ?? "")) return "zh-TW"
  return LOCALES.find((item) => item.code === value?.split(/[-_]/)[0])?.code ?? "en"
}
export function contentLocale(locale: Locale): string {
  return LOCALES.find((item) => item.code === locale)?.tag ?? "en-US"
}
export const BOOT_MESSAGES: Record<Locale, { loading: string; error: string; retry: string }> = {
  en: { loading: "Loading…", error: "Could not load this language.", retry: "Retry" },
  zh: { loading: "正在加载…", error: "暂时无法加载此语言。", retry: "重试" },
  "zh-TW": { loading: "載入中…", error: "暫時無法載入此語言。", retry: "重試" },
  es: { loading: "Cargando…", error: "No se pudo cargar este idioma.", retry: "Reintentar" },
  fr: { loading: "Chargement…", error: "Impossible de charger cette langue.", retry: "Réessayer" },
  de: {
    loading: "Wird geladen…",
    error: "Diese Sprache konnte nicht geladen werden.",
    retry: "Erneut versuchen",
  },
  pt: {
    loading: "Carregando…",
    error: "Não foi possível carregar este idioma.",
    retry: "Tentar novamente",
  },
  ru: { loading: "Загрузка…", error: "Не удалось загрузить этот язык.", retry: "Повторить" },
  ar: { loading: "جارٍ التحميل…", error: "تعذّر تحميل هذه اللغة.", retry: "إعادة المحاولة" },
  ja: { loading: "読み込み中…", error: "この言語を読み込めませんでした。", retry: "再試行" },
  ko: { loading: "불러오는 중…", error: "이 언어를 불러올 수 없습니다.", retry: "다시 시도" },
  hi: { loading: "लोड हो रहा है…", error: "यह भाषा लोड नहीं हो सकी।", retry: "फिर कोशिश करें" },
}
