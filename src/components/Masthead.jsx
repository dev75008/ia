import { Menu, Moon, Search, Sun, X } from 'lucide-react'
import { clockLabel } from '../lib/format.js'

export default function Masthead({
  online,
  today,
  updatedAt,
  query,
  onQuery,
  theme,
  onTheme,
  menuOpen,
  onMenu,
  searchRef,
}) {
  return (
    <>
      <div className="topbar">
        <div className="wrap topbar-inner">
          <span className={`live-dot${online ? ' is-on' : ''}`} aria-hidden="true" />
          <span className="topbar-item">{online ? 'direct' : 'hors ligne'}</span>
          <span className="topbar-sep" />
          <span className="topbar-item topbar-date">{today}</span>
          <span className="topbar-sep topbar-date-sep" />
          <span className="topbar-item">{clockLabel(updatedAt)} · dernière édition</span>
          <span className="topbar-push" />
          <span className="topbar-item topbar-hint">Recherche <kbd>/</kbd></span>
        </div>
      </div>

      <header className="masthead">
        <div className="wrap masthead-inner">
          <a className="brand" href="#top" aria-label="IA News, accueil">
            <img
              className="brand-mark"
              src={`${import.meta.env.BASE_URL}images/logo.webp`}
              alt=""
              width="72"
              height="72"
            />
            <span className="brand-word">IA<span>•</span>NEWS</span>
          </a>

          <nav id="navigation" className={`nav${menuOpen ? ' is-open' : ''}`} aria-label="Navigation principale">
            <a href="#une" onClick={() => onMenu(false)}>À la une</a>
            <a href="#radar" onClick={() => onMenu(false)}>Le radar</a>
            <a href="#fil" onClick={() => onMenu(false)}>Le fil</a>
            <a href="#sources" onClick={() => onMenu(false)}>Les sources</a>
          </nav>

          <label className="search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Rechercher dans les actualités</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Rechercher…"
            />
            {query ? (
              <button type="button" className="search-clear" onClick={() => onQuery('')} aria-label="Effacer la recherche">
                <X size={13} />
              </button>
            ) : null}
          </label>

          <button
            className="ghost-button"
            type="button"
            aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'}
            onClick={onTheme}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            className="ghost-button menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="navigation"
            onClick={() => onMenu(!menuOpen)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>
    </>
  )
}
