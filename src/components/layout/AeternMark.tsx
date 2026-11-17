import { useId } from "react"

export function AeternMark({ size = 28 }: { readonly size?: number }) {
  const uid = useId()
  const auroraId = `aetern-aurora-${uid}`
  const rimId = `aetern-rim-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="aetern-mark"
    >
      <defs>
        <linearGradient id={auroraId} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="52%" stopColor="#7C4DFF" />
          <stop offset="100%" stopColor="#FF2BD6" />
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.72" />
          <stop offset="50%" stopColor="#7C4DFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FF2BD6" stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
        fill="#05060F"
        stroke={`url(#${rimId})`}
        strokeWidth="1.25"
      />
      <path d="M16 6.2L24.4 24.4H20.8L16 13.6L11.2 24.4H7.6L16 6.2Z" fill="#F4F6FF" />
      <path
        d="M9.4 18.4C9.4 16.2 12.9 16.2 16 18.4C19.1 20.6 22.6 20.6 22.6 18.4C22.6 16.2 19.1 16.2 16 18.4C12.9 20.6 9.4 20.6 9.4 18.4Z"
        stroke={`url(#${auroraId})`}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
