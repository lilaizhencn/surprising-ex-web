import "./MarketSkeleton.css"

export function MarketSkeleton({ cards = false }: { readonly cards?: boolean }) {
  return (
    <div
      className={cards ? "grid-3 market-skeleton" : "market-skeleton"}
      role="status"
      aria-busy="true"
      aria-label="Loading markets"
    >
      {[0, 1, 2].map((index) => (
        <div key={index} className="market-skeleton-item" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}
