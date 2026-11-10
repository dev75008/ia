export default function Ticker({ sources }) {
  return (
    <div className="ticker-band" aria-hidden="true">
      <div className="ticker-track">
        {[0, 1].map((copy) => (
          <div className="ticker-group" key={copy}>
            {sources.slice(0, 14).map((entry) => (
              <span className="ticker-item" key={`${copy}-${entry.name}`}>
                <span className={`ticker-dot${entry.status === 'error' ? ' is-off' : ''}`} />
                {entry.name}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
