import { ArrowDown, Globe2 } from 'lucide-react'
import CardMedia from './CardMedia.jsx'
import CountUp from './CountUp.jsx'
import { relativeDate } from '../lib/format.js'

export default function Hero({ headline, stats, loading, onOpen, onReload }) {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="kicker">Veille mondiale · édition francophone</p>
          <h1 className="hero-title">
            <span className="hero-line"><span>L’IA,</span></span>
            <span className="hero-line"><span>en continu</span></span>
            <span className="hero-line"><span className="accent">et en français.</span></span>
          </h1>
          <p className="hero-lede">
            Toute la planète IA — labos, presse, recherche, régulation — filtrée, vérifiée et
            traduite en français avant publication.
          </p>
          <div className="hero-actions">
            <a className="button button-solid" href="#fil">Explorer le fil <ArrowDown size={15} aria-hidden="true" /></a>
            <a className="button button-ghost" href="#sources">Voir les sources <Globe2 size={15} aria-hidden="true" /></a>
          </div>
          <dl className="hero-stats">
            <div><dt>articles</dt><dd><CountUp value={stats.articles} /></dd></div>
            <div><dt>sources</dt><dd><CountUp value={stats.sources} /></dd></div>
            <div><dt>langues</dt><dd><CountUp value={stats.languages} /></dd></div>
            <div><dt>traduits</dt><dd><CountUp value={stats.translated} /></dd></div>
          </dl>
        </div>

        {headline ? (
          <a
            className="hero-feature"
            href={headline.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => onOpen(event, headline)}
            title={headline.translated ? 'Lire la traduction en français' : undefined}
          >
            <CardMedia image={headline.image} title={headline.title} translated={headline.translated} eager />
            <div className="hero-feature-body">
              <span className="hero-feature-label">à la une · {headline.category}</span>
              <h2>{headline.title}</h2>
              <div className="hero-feature-foot">
                <span>{headline.source}</span>
                <span>{relativeDate(headline.date)}</span>
              </div>
            </div>
          </a>
        ) : loading ? (
          <div className="hero-feature is-loading"><div className="skeleton skeleton-hero" /></div>
        ) : (
          <div className="hero-feature is-empty">
            <p>L’édition n’a pas pu être chargée.</p>
            <button type="button" className="button button-ghost" onClick={onReload}>Réessayer</button>
          </div>
        )}
      </div>
    </section>
  )
}
