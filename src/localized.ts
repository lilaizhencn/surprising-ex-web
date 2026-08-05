export type LanguageMode = "zh-CN" | "en-US";

export function localized(language: LanguageMode, zh: string, en: string): string {
  return language === "en-US" ? en : zh;
}

export function localizedNotice(language: LanguageMode, notice: string): string {
  const messages: Readonly<Record<string, string>> = {
    "连接后端中，若服务未启动会进入离线演示数据。": "Connecting to the backend. Live data remains hidden if the service is unavailable.",
    "交易对服务暂不可用，请稍后重试": "Market service is unavailable. Please try again later.",
    "交易对配置暂不可用，请稍后重试": "Market configuration is unavailable. Please try again later."
  };
  return language === "en-US" ? messages[notice] ?? notice : notice;
}
