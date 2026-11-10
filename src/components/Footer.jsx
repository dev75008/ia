import { clockLabel } from '../lib/format.js'

export default function Footer({ stats, updatedAt }) {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <span className="footer-brand-line">
            <img
              className="footer-logo"
              src={`${import.meta.env.BASE_URL}images/logo.webp`}
              alt=""
              width="56"
              height="56"
            />
            <span className="brand-word">IA<span>•</span>NEWS</span>
          </span>
          <p>Veille indépendante sur l’intelligence artificielle. Sources publiques, traduction automatique signalée, aucun contenu hébergé.</p>
        </div>
        <div className="footer-meta">
          <p>{stats.sources} sources · {stats.articles} articles · dernière édition {clockLabel(updatedAt)}</p>
          <p>© {new Date().getFullYear()} IA•News · Les contenus appartiennent à leurs éditeurs.</p>
        </div>
      </div>
    </footer>
  )
}
