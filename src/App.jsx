import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  ArrowDown, ArrowUpRight, Clock3, Globe2, Layers3, LoaderCircle, Menu,
  Moon, Search, Sun, X,
} from 'lucide-react'
import {
  cleanBlocks, fetchArticleText, readCached, translateBlocks, translateProxy, writeCached,
} from './reader.js'

gsap.registerPlugin(ScrollTrigger)

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}feed-snapshot.json`
const POLL_MS = 5 * 60 * 1000
const PAGE_SIZE = 36
const CATEGORY_ORDER = ['Modèles', 'Régulation', 'Recherche', 'Entreprise', 'Robotique', 'Société', 'Matériel', 'Sécurité', 'Actualité']

const LANGUAGE_NAMES = {
  fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien',
  pt: 'Portugais', nl: 'Néerlandais', ja: 'Japonais', zh: 'Chinois', ko: 'Coréen',
  ru: 'Russe', ar: 'Arabe', tr: 'Turc', pl: 'Polonais', sv: 'Suédois',
}

function languageName(code) {
  return LANGUAGE_NAMES[code] || (code ? code.toUpperCase() : '—')
}

function relativeDate(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time) || time <= 0) return 'date inconnue'
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(time)
}

function clockLabel(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function readMinutes(text = '') {
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200))
}

// Le résumé du flux est coupé à 420 caractères : on préfère une phrase entière,
// ou rien, plutôt qu'un chapô interrompu en plein mot dans le lecteur.
function readerLede(text = '') {
  if (!text) return ''
  if (text.length < 300) return text
  const cut = text.slice(0, 420)
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('。'),
  )
  return end >= 200 ? cut.slice(0, end + 1) : ''
}

function CardMedia({ image, title, translated }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`card-media${broken || !image ? ' is-fallback' : ''}`}>
      {!broken && image ? (
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span className="media-glyph" aria-hidden="true">{title.slice(0, 1)}</span>
      )}
      {translated ? <span className="lang-flag">traduit</span> : null}
    </div>
  )
}

function ArticleCard({ article, index, onOpen }) {
  return (
    <a
      className="article-card"
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
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

function SkeletonGrid({ count = 6 }) {
  return Array.from({ length: count }, (_, index) => <div className="skeleton" key={index} aria-hidden="true" />)
}

function useSnapshot() {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (foreground = false) => {
    if (foreground) setRefreshing(true)
    try {
      const response = await fetch(`${SNAPSHOT_URL}?v=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!Array.isArray(data.articles)) throw new Error('snapshot invalide')
      setSnapshot(data)
      setError('')
    } catch (cause) {
      setError(cause.message || 'snapshot indisponible')
    } finally {
      setLoading(false)
      if (foreground) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  return { snapshot, error, loading, refreshing, reload: () => load(true) }
}

function CountUp({ value, suffix = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = Number(value) || 0
    if (reduce) {
      node.textContent = target.toLocaleString('fr-FR')
      return undefined
    }
    const state = { value: 0 }
    const tween = gsap.to(state, {
      value: target,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => { node.textContent = Math.round(state.value).toLocaleString('fr-FR') },
    })
    return () => tween.kill()
  }, [value])
  return <span ref={ref}>0</span>
}

export default function App() {
  const { snapshot, error, loading, refreshing, reload } = useSnapshot()
  const [category, setCategory] = useState('Toutes')
  const [source, setSource] = useState('all')
  const [scope, setScope] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('date')
  const [menuOpen, setMenuOpen] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ianews-theme') || 'dark' } catch { return 'dark' }
  })
  const [now, setNow] = useState(() => Date.now())
  const [reader, setReader] = useState(null)

  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const readerRef = useRef(null)
  const readerAbort = useRef(null)

  const articles = useMemo(() => (Array.isArray(snapshot?.articles) ? snapshot.articles : []), [snapshot])
  const sources = useMemo(() => (Array.isArray(snapshot?.sources) ? snapshot.sources : []), [snapshot])
  const updatedAt = snapshot?.updatedAt ? new Date(snapshot.updatedAt) : null

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#f3efe7')
    try { localStorage.setItem('ianews-theme', theme) } catch { /* session only */ }
  }, [theme])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key === 'Escape') {
        setQuery('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const categories = useMemo(() => {
    const counts = new Map()
    articles.forEach((article) => counts.set(article.category, (counts.get(article.category) || 0) + 1))
    return [...counts.entries()]
      .sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]) || b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [articles])

  const availableSources = useMemo(
    () => [...new Set(articles.map((article) => article.source))].sort((a, b) => a.localeCompare(b, 'fr')),
    [articles],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return articles
      .filter((article) => (category === 'Toutes' || article.category === category)
        && (source === 'all' || article.source === source)
        && (scope === 'all' || (scope === 'translated' ? article.translated : !article.translated))
        && (!needle || `${article.title} ${article.description || ''}`.toLowerCase().includes(needle)))
      .sort((a, b) => (sort === 'source'
        ? a.source.localeCompare(b.source, 'fr') || new Date(b.date) - new Date(a.date)
        : new Date(b.date) - new Date(a.date)))
  }, [articles, category, source, scope, query, sort])

  // « À la une » est la tête d'édition, indépendante des filtres. Le reste de la
  // page déroule l'édition sans répétition : une, sélection de six, puis le fil.
  const headline = articles[0] || null
  const edition = useMemo(
    () => (headline ? filtered.filter((article) => article.link !== headline.link) : filtered),
    [filtered, headline],
  )
  const lead = edition[0] || null
  const selection = edition.slice(1, 7)
  const feed = edition.slice(7)

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [category, source, scope, query, sort])

  const stats = useMemo(() => {
    const langs = new Set(articles.map((article) => article.sourceLang).filter(Boolean))
    const countries = new Set(sources.map((entry) => entry.country).filter(Boolean))
    return {
      articles: articles.length,
      sources: sources.filter((entry) => entry.status !== 'error').length || sources.length,
      languages: langs.size,
      countries: countries.size,
      translated: articles.filter((article) => article.translated).length,
    }
  }, [articles, sources])

  // Entrée de page : révélation masquée ligne par ligne, puis sections au défilement.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
      intro.from('.topbar-inner', { yPercent: -100, opacity: 0, duration: 0.5 })
        .from('.masthead', { y: -18, opacity: 0, duration: 0.5 }, '-=0.25')
        .from('.hero-line > span', { yPercent: 115, duration: 0.9, stagger: 0.09 }, '-=0.2')
        .from('.hero-lede, .hero-actions', { y: 18, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.45')
        .from('.hero-feature', { opacity: 0, y: 26, scale: 0.985, duration: 0.8 }, '-=0.6')
        .from('.ticker-band', { opacity: 0, duration: 0.5 }, '-=0.3')

      gsap.utils.toArray('.reveal').forEach((section) => {
        gsap.from(section, {
          y: 34,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          scrollTrigger: { trigger: section, start: 'top 88%', once: true },
        })
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  // Changement de filtre : les cartes entrent en cascade, sans rejouer au défilement.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const cards = gsap.utils.toArray('.article-card')
    if (!cards.length) return undefined
    const tween = gsap.fromTo(cards,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.5, stagger: { each: 0.028, amount: 0.45 }, ease: 'power2.out', overwrite: true })
    return () => tween.kill()
  }, [category, source, scope, sort, query])

  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const online = !error && articles.length > 0

  // Lecture immersive : un clic simple sur un article traduit ouvre le lecteur,
  // les clics modifiés (nouvel onglet) continuent d'ouvrir l'éditeur d'origine.
  const openReader = useCallback((event, article) => {
    if (!article.translated) return
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const cached = readCached(article.id)
    setReader({
      article,
      status: cached ? 'ready' : 'loading',
      blocks: cached?.blocks || [],
      progress: 0,
      error: '',
    })
  }, [])

  const closeReader = useCallback(() => {
    readerAbort.current?.abort()
    setReader(null)
  }, [])

  useEffect(() => {
    if (!reader || reader.status !== 'loading') return undefined
    const article = reader.article
    const controller = new AbortController()
    readerAbort.current = controller
    ;(async () => {
      try {
        const raw = await fetchArticleText(article.link, controller.signal)
        const blocks = cleanBlocks(raw, article)
        if (blocks.length < 3) throw new Error('article non extractible')
        const translated = await translateBlocks(blocks, {
          signal: controller.signal,
          onProgress: (done, total) => setReader((state) => (
            state && state.article.id === article.id ? { ...state, progress: done / total } : state
          )),
        })
        if (controller.signal.aborted) return
        writeCached(article.id, translated)
        setReader((state) => (
          state && state.article.id === article.id ? { ...state, status: 'ready', blocks: translated } : state
        ))
      } catch (cause) {
        if (controller.signal.aborted) return
        setReader((state) => (
          state && state.article.id === article.id ? { ...state, status: 'error', error: cause.message } : state
        ))
      }
    })()
    return () => controller.abort()
  }, [reader?.article.id])

  useEffect(() => {
    const node = readerRef.current
    if (!node) return undefined
    if (reader && !node.open) node.showModal()
    if (!reader && node.open) node.close()
    document.documentElement.classList.toggle('reader-open', Boolean(reader))
    return () => document.documentElement.classList.remove('reader-open')
  }, [reader])

  return (
    <div className="shell" ref={rootRef}>
      <a className="skip-link" href="#fil">Aller au fil d’actualité</a>

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
              width="40"
              height="40"
            />
            <span className="brand-word">IA<span>•</span>NEWS</span>
          </a>

          <nav id="navigation" className={`nav${menuOpen ? ' is-open' : ''}`} aria-label="Navigation principale">
            <a href="#une" onClick={() => setMenuOpen(false)}>À la une</a>
            <a href="#radar" onClick={() => setMenuOpen(false)}>Le radar</a>
            <a href="#fil" onClick={() => setMenuOpen(false)}>Le fil</a>
            <a href="#sources" onClick={() => setMenuOpen(false)}>Les sources</a>
          </nav>

          <label className="search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Rechercher dans les actualités</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher…"
            />
            {query ? (
              <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche">
                <X size={13} />
              </button>
            ) : null}
          </label>

          <button
            className="ghost-button"
            type="button"
            aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            className="ghost-button menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      <main id="top">
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
                onClick={(event) => openReader(event, headline)}
                title={headline.translated ? 'Lire la traduction en français' : undefined}
              >
                <CardMedia image={headline.image} title={headline.title} translated={headline.translated} />
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
                <button type="button" className="button button-ghost" onClick={reload}>Réessayer</button>
              </div>
            )}
          </div>
        </section>

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

        <section className="radar reveal" id="radar" aria-labelledby="radar-title">
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="kicker">Le radar</p>
                <h2 id="radar-title">Six façons de lire l’IA</h2>
              </div>
              <p className="section-note">{stats.sources} sources suivies · {stats.countries || '—'} pays · mise à jour toutes les 15 minutes</p>
            </div>
            <div className="radar-grid">
              {categories.slice(0, 6).map((item, index) => (
                <button
                  type="button"
                  className={`radar-card${category === item.name ? ' is-active' : ''}`}
                  key={item.name}
                  onClick={() => { setCategory(item.name); document.getElementById('fil')?.scrollIntoView({ behavior: 'smooth' }) }}
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

        <section className="feed reveal" id="une" aria-labelledby="une-title">
          <div className="wrap">
            <div className="section-head section-head-split">
              <div>
                <p className="kicker">À la une</p>
                <h2 id="une-title">La sélection du jour</h2>
              </div>
              <p className="section-note">
                {filtered.length.toLocaleString('fr-FR')} article{filtered.length > 1 ? 's' : ''} dans cette vue
              </p>
            </div>

            {lead ? (
              <a
                className={`lead-story${lead.image ? '' : ' is-text'}`}
                href={lead.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => openReader(event, lead)}
                title={lead.translated ? 'Lire la traduction en français' : undefined}
              >
                {lead.image ? <CardMedia image={lead.image} title={lead.title} translated={lead.translated} /> : null}
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
                <ArticleCard article={article} index={index} key={article.link} onOpen={openReader} />
              ))}
            </div>
          </div>
        </section>

        <section className="feed reveal" id="fil" aria-labelledby="fil-title">
          <div className="wrap">
            <div className="section-head section-head-split">
              <div>
                <p className="kicker">Le fil</p>
                <h2 id="fil-title">Toute l’actualité</h2>
              </div>
              <button className="button button-ghost refresh" type="button" onClick={reload} disabled={refreshing}>
                {refreshing ? <LoaderCircle className="spin" size={14} /> : <Layers3 size={14} />}
                Actualiser
              </button>
            </div>

            <div className="toolbar">
              <div className="chips" role="group" aria-label="Filtrer par catégorie">
                <button type="button" className={`chip${category === 'Toutes' ? ' is-active' : ''}`} aria-pressed={category === 'Toutes'} onClick={() => setCategory('Toutes')}>
                  Toutes <span>{articles.length}</span>
                </button>
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    className={`chip${category === item.name ? ' is-active' : ''}`}
                    aria-pressed={category === item.name}
                    onClick={() => setCategory(item.name)}
                  >
                    {item.name} <span>{item.count}</span>
                  </button>
                ))}
              </div>

              <div className="filters">
                <label className="select">
                  <span className="sr-only">Filtrer par source</span>
                  <select value={source} onChange={(event) => setSource(event.target.value)}>
                    <option value="all">Toutes les sources</option>
                    {availableSources.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>

                <label className="select">
                  <span className="sr-only">Filtrer par langue d’origine</span>
                  <select value={scope} onChange={(event) => setScope(event.target.value)}>
                    <option value="all">Toutes les langues</option>
                    <option value="translated">Traduits en français</option>
                    <option value="original">Publiés en français</option>
                  </select>
                </label>

                <label className="select">
                  <span className="sr-only">Trier les articles</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="date">Plus récents</option>
                    <option value="source">Par source</option>
                  </select>
                </label>
              </div>
            </div>

            <p className="status" role="status" aria-live="polite">
              {error && !articles.length
                ? <>Édition indisponible ({error}). Réessayez dans quelques minutes.</>
                : <>{filtered.length} article{filtered.length > 1 ? 's' : ''}{stats.translated ? ` · ${stats.translated} traduits vers le français` : ''} · actualisation automatique toutes les 15 min</>}
            </p>

            <div className="story-grid">
              {loading ? <SkeletonGrid count={9} /> : feed.length ? (
                feed.slice(0, visible).map((article, index) => <ArticleCard article={article} index={index} key={article.link} onOpen={openReader} />)
              ) : (
                <div className="empty">
                  <strong>{filtered.length ? 'Cette vue tient dans la sélection ci-dessus.' : 'Aucun article ne correspond à cette vue.'}</strong>
                  <p>
                    {filtered.length
                      ? 'Élargissez les filtres pour dérouler davantage d’articles.'
                      : 'Changez de catégorie, de source ou effacez la recherche.'}
                  </p>
                  <button type="button" className="button button-ghost" onClick={() => { setCategory('Toutes'); setSource('all'); setScope('all'); setQuery('') }}>
                    Réinitialiser les filtres
                  </button>
                </div>
              )}
            </div>

            {feed.length > visible ? (
              <div className="load-more">
                <button type="button" className="button button-ghost" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                  Afficher {Math.min(PAGE_SIZE, feed.length - visible)} articles de plus
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </section>

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
                  <span className="source-count">{entry.status === 'error' ? 'indisponible' : entry.count ? `${entry.count} art.` : 'aucun retenu'}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="footer-brand">
            <span className="footer-brand-line">
              <img
                className="footer-logo"
                src={`${import.meta.env.BASE_URL}images/logo.webp`}
                alt=""
                width="44"
                height="44"
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

      <dialog className="reader" ref={readerRef} onClose={closeReader} aria-labelledby="reader-title">
        {reader ? (
          <div className="reader-panel">
            <header className="reader-head">
              <div className="reader-title-block">
                <p className="reader-kicker">Traduction automatique · {reader.article.source}</p>
                <h2 id="reader-title">{reader.article.title}</h2>
              </div>
              <div className="reader-tools">
                <a className="button button-ghost" href={reader.article.link} target="_blank" rel="noopener noreferrer">
                  Original <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                <button className="ghost-button" type="button" onClick={closeReader} aria-label="Fermer la lecture">
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="reader-body">
              {reader.status === 'loading' ? (
                <div className="reader-loading" role="status" aria-live="polite">
                  {readerLede(reader.article.description) ? <p className="reader-lede">{readerLede(reader.article.description)}</p> : null}
                  <p className="reader-progress">
                    <LoaderCircle className="spin" size={16} aria-hidden="true" />
                    Extraction et traduction de l’article…{reader.progress ? ` ${Math.round(reader.progress * 100)} %` : ''}
                  </p>
                  <div className="reader-skeleton" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
                  </div>
                </div>
              ) : reader.status === 'error' ? (
                <div className="reader-error">
                  <strong>La traduction immersive n’a pas abouti.</strong>
                  <p>{reader.error}. L’article reste lisible via Google Traduction ou chez l’éditeur.</p>
                  <div className="reader-actions">
                    <a className="button button-solid" href={translateProxy(reader.article.link)} target="_blank" rel="noopener noreferrer">
                      Lire via Google Traduction <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                    <a className="button button-ghost" href={reader.article.link} target="_blank" rel="noopener noreferrer">
                      Ouvrir l’original
                    </a>
                  </div>
                </div>
              ) : (
                <article className="reader-content">
                  {readerLede(reader.article.description) ? <p className="reader-lede">{readerLede(reader.article.description)}</p> : null}
                  {reader.blocks.map((block, index) => <p key={index}>{block}</p>)}
                </article>
              )}
            </div>

            <footer className="reader-foot">
              <span>Traduction automatique à la demande. L’original fait foi.</span>
              <a href={reader.article.link} target="_blank" rel="noopener noreferrer">
                {reader.article.source} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </footer>
          </div>
        ) : null}
      </dialog>
    </div>
  )
}
