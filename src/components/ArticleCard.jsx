import { memo } from 'react'
import { ArrowUpRight, Clock3 } from 'lucide-react'
import CardMedia from './CardMedia.jsx'
import { languageName, readMinutes, relativeDate } from '../lib/format.js'

function ArticleCard({ article, index, onOpen }) {
  return (
    <a
      className="article-card"
      href={article.translated ? `${import.meta.env.BASE_URL}article/${article.id}/` : article.link}
      target={article.translated ? undefined : '_blank'}
      rel={article.translated ? undefined : 'noopener noreferrer'}
      style={{ '--i': index }}
      onClick={(event) => onOpen(event, article)}
      title={article.translated ? 'Lire la traduction en français' : undefined}
    >
      <CardMedia image={article.image} title={article.title} translated={article.translated} />
      <div className="card-body">
        <div className="card-meta">
          <span className="card-category">{article.category}</span>
          <span className="card-time"><Clock3 size={12} aria-hidden="true" />{relativeDate(article.date)}</span>
        </div>
        <h3 className="card-title">{article.title}</h3>
        {article.description ? <p className="card-excerpt">{article.description}</p> : null}
        <div className="card-foot">
          <span className="card-source">
            {article.source}
            {article.translated ? ` · ${languageName(article.sourceLang)} → FR` : ''}
          </span>
          <span className="card-read">{readMinutes(article.description || article.title)} min</span>
          <ArrowUpRight className="card-arrow" size={15} aria-hidden="true" />
        </div>
      </div>
    </a>
  )
}

export default memo(ArticleCard)
