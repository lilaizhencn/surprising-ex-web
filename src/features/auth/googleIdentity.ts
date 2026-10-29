export interface GoogleIdentity {
  initialize(options: {
    client_id: string
    nonce: string
    callback: (result: { credential: string }) => void
    auto_select: boolean
    cancel_on_tap_outside: boolean
    itp_support: boolean
  }): void
  renderButton(
    element: HTMLElement,
    options: {
      theme: "outline" | "filled_black"
      size: "large"
      type: "standard"
      text: "continue_with"
      shape: "rectangular"
      width: number
      locale: string
    },
  ): void
  prompt(): void
  cancel(): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } }
  }
}

let loading: Promise<GoogleIdentity> | null = null
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const available = window.google?.accounts.id
  if (available) return Promise.resolve(available)
  if (loading) return loading
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script")
    const timeout = window.setTimeout(() => fail(), 15_000)
    const fail = () => {
      window.clearTimeout(timeout)
      script.remove()
      loading = null
      reject(new Error("Google sign-in could not load. Please retry."))
    }
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.onload = () => {
      window.clearTimeout(timeout)
      const api = window.google?.accounts.id
      if (api) resolve(api)
      else fail()
    }
    script.onerror = fail
    document.head.append(script)
  })
  return loading
}
