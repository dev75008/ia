import { ArrowUpRight } from 'lucide-react'

export default function Radar({ categories, active, onSelect, sourceCount, countryCount }) {
  return (
    <section className="radar reveal" id="radar" aria-labelledby="radar-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <p className="kicker">Le radar</p>
            <h2 id="radar-title">Six façons de lire l’IA</h2>
          </div>
          <p className="section-note">
            {sourceCount} sources suivies · {countryCount || '—'} pays · mise à jour toutes les 15 minutes
          </p>
        </div>
        <div className="radar-grid">
          {categories.slice(0, 6).map((item, index) => (
            <button
              type="button"
              className={`radar-card${active === item.name ? ' is-active' : ''}`}
              key={item.name}
              onClick={() => {
                onSelect(item.name)
                document.getElementById('fil')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <span className="radar-index">0{index + 1}</span>
              <span className="radar-name">{item.name}</span>
              <span className="radar-count">{item.count}</span>
              <ArrowUpRight className="radar-arrow" size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
