import ArticleCard from './ArticleCard.jsx'
import CardMedia from './CardMedia.jsx'
import SkeletonGrid from './SkeletonGrid.jsx'
import { relativeDate, readMinutes } from '../lib/format.js'

export default function Selection({ lead, selection, loading, total, onOpen }) {
  return (
    <section className="feed reveal" id="une" aria-labelledby="une-title">
      <div className="wrap">
        <div className="section-head section-head-split">
          <div>
            <p className="kicker">À la une</p>
            <h2 id="une-title">La sélection du jour</h2>
          </div>
          <p className="section-note">
            {total.toLocaleString('fr-FR')} article{total > 1 ? 's' : ''} dans cette vue
          </p>
        </div>

        {lead ? (
          <a
            className={`lead-story${lead.image ? '' : ' is-text'}`}
            href={lead.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => onOpen(event, lead)}
            title={lead.translated ? 'Lire la traduction en français' : undefined}
          >
            {lead.image ? <CardMedia image={lead.image} title={lead.title} translated={lead.translated} eager /> : null}
            <div className="lead-body">
              <span className="lead-category">{lead.category}</span>
              <h3>{lead.title}</h3>
              <p>{lead.description}</p>
              <div className="lead-foot">
                <span>{lead.source}</span>
                <span>{relativeDate(lead.date)}</span>
                <span className="lead-read">{readMinutes(lead.description)} min de lecture</span>
              </div>
            </div>
          </a>
        ) : null}

        <div className="story-grid">
          {loading ? <SkeletonGrid count={6} /> : selection.map((article, index) => (
            <ArticleCard article={article} index={index} key={article.link} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </section>
  )
}
