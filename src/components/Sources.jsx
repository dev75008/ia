import { languageName } from '../lib/format.js'

export default function Sources({ sources }) {
  return (
    <section className="sources reveal" id="sources" aria-labelledby="sources-title">
      <div className="wrap">
        <div className="section-head section-head-split">
          <div>
            <p className="kicker">Transparence</p>
            <h2 id="sources-title">Les sources de cette édition</h2>
          </div>
          <p className="section-note">
            Chaque flux est interrogé à la source. Les contenus non francophones sont traduits
            automatiquement et signalés ; une source sans article retenu reste listée.
          </p>
        </div>
        <ul className="source-grid">
          {sources.map((entry) => (
            <li className={`source-card${entry.status === 'error' ? ' is-error' : ''}`} key={entry.name}>
              <span className="source-status" aria-hidden="true" />
              <span className="source-name">{entry.name}</span>
              <span className="source-lang">{languageName(entry.lang)}</span>
              <span className="source-count">
                {entry.status === 'error' ? 'indisponible' : entry.count ? `${entry.count} art.` : 'aucun retenu'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
