import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ArrowUpRight, Clock3, LoaderCircle, Moon, RefreshCw, Search, Sun, Sparkles, Menu, X, ArrowDown } from 'lucide-react'


// Ajoutez, retirez ou modifiez les sources dans cette liste.
const FEEDS = [
  { name: 'Le Monde Informatique', url: 'https://www.lemondeinformatique.fr/flux-rss/thematique/intelligence-artificielle/rss.xml' },
  { name: 'Journal du Net', url: 'https://www.journaldunet.com/intelligence-artificielle/rss/' },
  { name: 'L’Usine Digitale', url: 'https://www.usine-digitale.fr/rss' },
  { name: 'ActuIA', url: 'https://www.actuia.com/feed/' },
  { name: 'Siècle Digital', url: 'https://siecledigital.fr/feed/' },
  { name: 'Numerama', url: 'https://www.numerama.com/feed/' },
  { name: 'LeBigData', url: 'https://www.lebigdata.fr/feed' },
  { name: 'Numerama · IA', url: 'https://www.numerama.com/tag/intelligence-artificielle/feed/' },
]
const CACHE_KEY = 'ianews-react-feed-v2'
const CACHE_TTL = 15 * 60 * 1000
const REFRESH_MS = 15 * 60 * 1000
const AI_RELEVANCE = /\bIA\b|intelligence artificielle|ia générative|ia agentique|chatgpt|openai|anthropic|mistral|gemini|llama|copilot|gpt-[\w.]+|modèle[s]? de langage|large language model|\bllm\b|machine learning|apprentissage automatique|deep learning|robotique|humanoïde|agent[s]? intelligent[s]?/i

function clean(value = '') {
  const node = document.createElement('div')
  node.innerHTML = value
  return (node.textContent || node.innerText || '').replace(/\s+/g, ' ').trim()
}

function safeUrl(value = '') {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function categorize(text) {
  const value = text.toLowerCase()
  if (/réglement|régul|loi|ai act|législat|éthique|droit|commission européenne/.test(value)) return 'Régulation'
  if (/robot|humanoïde|autonom|drone|robotique/.test(value)) return 'Robotique'
  if (/recherche|chercheur|étude|scientifi|université|laboratoire|modèle de langage|llm/.test(value)) return 'Recherche'
  if (/entreprise|invest|startup|levée|acquisition|partenariat|déploi|emploi|marché/.test(value)) return 'Entreprise'
  if (/générat|chatgpt|openai|anthropic|mistral|gemini|llama|image|vidéo|copilot|gpt-/.test(value)) return 'Modèles génératifs'
  return 'Actualité'
}

function parseItem(item, feed) {
  const title = clean(item.title)
  const link = safeUrl(item.link || item.guid)
  if (!title || !link) return null
  const description = clean(item.description || item.content || item['content:encoded'] || '').slice(0, 420)
  if (!AI_RELEVANCE.test(`${title} ${description}`)) return null
  const dateValue = item.pubDate || item.isoDate || item.date
  const date = dateValue && Number.isFinite(new Date(dateValue).getTime()) ? new Date(dateValue) : new Date(0)
  let image = safeUrl(item.thumbnail || item.enclosure?.link || '')
  if (!image) {
    const match = (item.description || item.content || '').match(/<img[^>]+src=["']([^"']+)/i)
    if (match) image = safeUrl(match[1])
  }
  return { title, link, description, date: date.toISOString(), source: feed.name, feedUrl: feed.url, image, category: categorize(`${title} ${description}`) }
}

function parseXml(xml, feed) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('Flux RSS invalide')
  return [...doc.querySelectorAll('item, entry')].map((el) => {
    const get = (name) => el.querySelector(name)?.textContent || ''
    const link = el.querySelector('link')?.getAttribute('href') || get('link')
    const enclosure = el.querySelector('enclosure')?.getAttribute('url') || el.querySelector('media\\:content, content')?.getAttribute('url') || ''
    return parseItem({
      title: get('title'), link, description: get('description') || get('summary') || get('content:encoded') || get('content'),
      pubDate: get('pubDate') || get('published') || get('updated'), thumbnail: enclosure,
    }, feed)
  }).filter(Boolean)
}

async function fetchFeed(feed) {
  const target = encodeURIComponent(feed.url)
  const proxies = [
    `https://api.rss2json.com/v1/api.json?rss_url=${target}`,
    `https://api.allorigins.win/raw?url=${target}`,
  ]
  for (const proxy of proxies) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9500)
    try {
      const response = await fetch(proxy, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      const body = await response.text()
      if (proxy.includes('rss2json')) {
        const data = JSON.parse(body)
        if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('RSS indisponible')
        return data.items.map((item) => parseItem(item, feed)).filter(Boolean)
      }
      if (contentType.includes('json')) {
        const data = JSON.parse(body)
        if (data.contents) return parseXml(data.contents, feed)
      }
      return parseXml(body, feed)
    } catch {
      // Le proxy suivant est essayé ; un flux défaillant n’interrompt pas la veille.
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('Tous les proxys sont indisponibles')
}

function relativeDate(value) {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(value))
}

function faviconFor(feedUrl) {
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(feedUrl).hostname)}&sz=64` } catch { return '' }
}

async function getStaticSnapshot() {
  const response = await fetch(`${import.meta.env.BASE_URL}feed-snapshot.json?v=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Snapshot indisponible (${response.status})`)
  const data = await response.json()
  if (!Array.isArray(data.articles)) throw new Error('Snapshot RSS invalide')
  return data
}

function Skeletons({ count = 6 }) {
  return Array.from({ length: count }, (_, index) => <div className="skeleton" key={index} aria-hidden="true" />)
}

function ArticleCard({ article }) {
  const [imageFailed, setImageFailed] = useState(false)
  const readMinutes = Math.max(1, Math.ceil(article.description.split(/\s+/).length / 200))
  return (
    <a className="article-card" href={article.link} target="_blank" rel="noopener noreferrer" aria-label={`${article.title} — lire chez ${article.source}`}>
      <div className="article-media">
        {article.image && !imageFailed
          ? <img src={article.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
          : <div className="media-placeholder"><Sparkles size={30} strokeWidth={1.4} aria-hidden="true" /></div>}
        <span className="source-badge"><img src={faviconFor(article.feedUrl)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />{article.source}</span>
        <ArrowUpRight className="card-arrow" size={18} aria-hidden="true" />
      </div>
      <div className="article-body">
        <div className="article-kicker"><span className="category">{article.category}</span><time dateTime={article.date}>{relativeDate(article.date)}</time></div>
        <h3>{article.title}</h3>
        <p className="excerpt">{article.description || 'Découvrez les détails de cette actualité sur le site de la source.'}</p>
        <div className="article-bottom"><span>{article.source}</span><span className="read-time"><Clock3 size={13} /> {readMinutes} min</span></div>
      </div>
    </a>
  )
}

export default function App() {
  const [articles, setArticles] = useState([])
  const [category, setCategory] = useState('Toutes')
  const [source, setSource] = useState('all')
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sort, setSort] = useState('date')
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ianews-theme') || 'dark' } catch { return 'dark' }
  })
  const [lastFetch, setLastFetch] = useState(null)
  const [failedFeeds, setFailedFeeds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [status, setStatus] = useState('Chargement des flux d’actualité…')
  const rootRef = useRef(null)
  const refreshRef = useRef(null)
  const fetchingRef = useRef(false)

  const loadFeeds = useCallback(async (force = false) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setFetching(true)
    setStatus('Récupération des dernières actualités…')
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
        if (cached && Date.now() - cached.saved < CACHE_TTL && Array.isArray(cached.articles) && cached.articles.length) {
          setArticles(cached.articles)
          setLastFetch(cached.saved)
          setFailedFeeds(cached.failed || 0)
          setLoading(false)
          setStatus(cached.failed ? `Cache local · ${cached.failed} flux indisponible${cached.failed > 1 ? 's' : ''}.` : '')
          setFetching(false)
          fetchingRef.current = false
          return
        }
      } catch { /* Cache absent ou invalide : on recharge les sources. */ }
      try {
        const snapshot = await getStaticSnapshot()
        if (snapshot.articles.length) {
          setArticles(snapshot.articles)
          setLastFetch(snapshot.updatedAt ? new Date(snapshot.updatedAt).getTime() : Date.now())
          setLoading(false)
          setStatus('Édition récente · synchronisation des flux en direct…')
        }
      } catch { /* Les proxys directs peuvent encore fournir les actualités. */ }
    }
    const results = await Promise.allSettled(FEEDS.map(fetchFeed))
    let failures = 0
    const collected = []
    results.forEach((result) => {
      if (result.status === 'fulfilled') collected.push(...result.value)
      else failures += 1
    })
    const seen = new Set()
    let merged = collected.filter((article) => {
      const key = (article.link || article.title).toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
    let usedSnapshot = false
    if (!merged.length) {
      try {
        const snapshot = await getStaticSnapshot()
        if (snapshot.articles.length) {
          merged = snapshot.articles
          usedSnapshot = true
        }
      } catch { /* Le site reste utilisable même si le snapshot statique n’est pas disponible. */ }
    }
    const saved = Date.now()
    setArticles(merged)
    setLastFetch(saved)
    setFailedFeeds(failures)
    setLoading(false)
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ saved, articles: merged, failed: failures })) } catch { /* Le site continue sans cache si le stockage est plein. */ }
    setStatus(merged.length
      ? usedSnapshot ? 'Flux en direct momentanément indisponibles · affichage de la dernière édition.' : ''
      : `Impossible de charger les flux d’actualité (${failures || FEEDS.length} sources). Réessayez ou revenez dans quelques minutes.`)
    setFetching(false)
    fetchingRef.current = false
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#272727' : '#f8f5f0')
    try { localStorage.setItem('ianews-theme', theme) } catch { /* Préférence limitée à la session. */ }
  }, [theme])

  useEffect(() => {
    loadFeeds()
    const timer = window.setInterval(() => loadFeeds(true), REFRESH_MS)
    const clock = window.setInterval(() => setLastFetch((value) => value), 60000)
    return () => { window.clearInterval(timer); window.clearInterval(clock) }
  }, []) // Chargement initial et actualisation périodique.

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
      intro.from('.header-inner', { opacity: 0, duration: 0.75 })
        .from('.hero .eyebrow', { y: 15, opacity: 0, duration: 0.5 }, '-=0.35')
        .from('.hero-title', { y: 32, opacity: 0, duration: 0.85 }, '-=0.25')
        .from('.hero-copy, .hero-stats', { y: 16, opacity: 0, duration: 0.55, stagger: 0.12 }, '-=0.4')
      intro.from('.hero-actions, .hero-caption', { y: 24, opacity: 0, duration: 0.9, stagger: 0.12 }, '-=0.4')
      gsap.utils.toArray('.reveal-section').forEach((section, index) => gsap.from(section, {
        y: 28, opacity: 0, duration: 0.7, delay: 0.15 + index * 0.12, ease: 'power2.out',
      }))
    }, rootRef)
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    if (!articles.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cards = gsap.utils.toArray('.article-card')
    if (cards.length) gsap.fromTo(cards, { y: 24, opacity: 0, scale: 0.985 }, { y: 0, opacity: 1, scale: 1, duration: 0.72, stagger: { each: 0.035, amount: 0.65 }, ease: 'power3.out', overwrite: 'auto' })
    const trendCards = gsap.utils.toArray('.trend-card')
    if (trendCards.length) gsap.fromTo(trendCards, { y: 20, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.65, stagger: 0.11, ease: 'power3.out', overwrite: 'auto' })
  }, [articles, category, source, query, sort])

  const categories = useMemo(() => ['Toutes', ...new Set(articles.map((article) => article.category))], [articles])
  const sources = useMemo(() => [...new Set(articles.map((article) => article.source))].sort((a, b) => a.localeCompare(b, 'fr')), [articles])
  const filtered = useMemo(() => articles.filter((article) =>
    (category === 'Toutes' || article.category === category)
    && (source === 'all' || article.source === source)
    && (!query || `${article.title} ${article.description}`.toLowerCase().includes(query.toLowerCase().trim())),
  ).sort((a, b) => sort === 'source' ? a.source.localeCompare(b.source, 'fr') || new Date(b.date) - new Date(a.date) : new Date(b.date) - new Date(a.date)), [articles, category, source, query, sort])
  const trending = articles.slice(0, 5)

  return (
    <div className="app-shell" ref={rootRef}>
      <aside className="side-rail" aria-label="Repères de navigation"><span className="rail-name">L’IA SOUS UN NOUVEL ANGLE</span><a href="#feed-title" aria-label="Aller aux actualités"><ArrowDown size={17} /></a><span className="rail-index">FR / IA</span></aside>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand" href="#top" aria-label="IA News, accueil"><svg className="brand-symbol" width="45" height="34" viewBox="0 0 45 34" fill="none" aria-hidden="true"><path d="M5 28V13L22 4L39 13V28H5ZM22 4V28M5 13L22 21L39 13M12 9V24M32 9V24" stroke="currentColor" strokeWidth="1.1" /><circle cx="22" cy="4" r="2" fill="currentColor" /></svg><span className="brand-word">IA<span className="brand-dot">•</span>NEWS</span><span className="brand-tagline">REGARDS SUR DEMAIN</span></a>
          <nav id="main-navigation" className={`header-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navigation principale"><a href="#top" onClick={() => setMenuOpen(false)}>Accueil</a><a href="#trending-title" onClick={() => setMenuOpen(false)}>À la une</a><a href="#feed-title" onClick={() => setMenuOpen(false)}>Les actualités</a></nav>
          <label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">Rechercher dans les actualités</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une actualité…" /></label>
          <button className="icon-button" type="button" aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="menu-button" type="button" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-backdrop" aria-hidden="true" />
          <div className="hero-frame" aria-hidden="true" />
          <div className="hero-content">
            <div className="eyebrow">L’INTELLIGENCE ARTIFICIELLE, AUTREMENT</div>
            <h1 id="hero-title" className="hero-title">L’intelligence<br />qui façonne<br /><span>demain.</span></h1>
            <p className="hero-subtitle">LES IDÉES D’AUJOURD’HUI. LE MONDE DE DEMAIN.</p>
            <p className="hero-copy">Découvrez les avancées, les talents et les idées qui transforment notre monde. Toute l’actualité de l’IA, en français.</p>
            <div className="hero-actions"><a className="primary-link" href="#feed-title">Explorer les actualités <ArrowUpRight size={17} aria-hidden="true" /></a></div>
          </div>
          <div className="hero-caption"><span>IA•NEWS / VEILLE FRANCOPHONE</span><span>TECHNOLOGIE · RECHERCHE · SOCIÉTÉ</span></div>
          <a className="hero-scroll" href="#trending-title" aria-label="Découvrir la sélection"><ArrowDown size={20} /></a>
        </section>
        <div className="edition-bar wrap"><span className="edition-label">L’ÉDITION IA•NEWS</span><div className="hero-stats"><span><strong>{articles.length.toLocaleString('fr-FR')}</strong> articles</span><i /><span>Mis à jour <strong>{lastFetch ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(lastFetch) : 'au démarrage'}</strong></span><i /><span>{new Set(articles.map((article) => article.source)).size || FEEDS.length} sources</span></div></div>

        <section className="intro-section wrap reveal-section" aria-labelledby="intro-title">
          <div><span className="section-eyebrow">LE REGARD IA•NEWS</span><h2 id="intro-title">Comprendre.<br /><span>Voir plus loin.</span></h2></div>
          <div className="intro-copy"><p>L’intelligence artificielle redessine nos façons de créer, de travailler et de penser. Nous réunissons les regards francophones pour vous aider à suivre ce mouvement.</p><p>Recherche, modèles génératifs, entreprises et société : explorez les sujets qui comptent, à votre rythme.</p><a className="intro-link" href="#feed-title">Découvrir le fil <ArrowUpRight size={16} aria-hidden="true" /></a></div>
        </section>

        <section className="trending wrap reveal-section" data-section="01" aria-labelledby="trending-title">
          <div className="section-heading"><div><span className="section-eyebrow">L’ESSENTIEL</span><h2 id="trending-title">À la <span className="heading-accent">une</span></h2><p>Les dernières nouvelles à ne pas manquer.</p></div><span className="section-index">01 — 05</span></div>
          <div className="trend-grid">{loading ? <Skeletons count={5} /> : trending.length ? trending.map((article, index) => <a className="trend-card" href={article.link} target="_blank" rel="noopener noreferrer" key={article.link}><div className="trend-media" aria-hidden="true">{article.image ? <img src={article.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : <Sparkles size={38} strokeWidth={1} />}</div><span className="trend-number">0{index + 1}</span><h3>{article.title}</h3><span className="trend-source">{article.source} · {relativeDate(article.date)}</span><ArrowUpRight className="trend-arrow" size={15} aria-hidden="true" /></a>) : <div className="empty trend-empty">Les tendances apparaîtront dès réception des flux.</div>}</div>
        </section>

        <section className="feed-section wrap reveal-section" data-section="02" aria-labelledby="feed-title">
          <div className="section-heading feed-heading"><div><span className="section-eyebrow">LE DIRECT</span><h2 id="feed-title">Le fil de <span className="heading-accent">l’IA</span></h2><p>Votre regard sur un monde qui évolue.</p></div><span className="section-index">{String(filtered.length).padStart(2, '0')} ARTICLES</span></div>
          <div className="toolbar" aria-label="Filtres des actualités">
            <div className="chips" role="group" aria-label="Filtrer par catégorie">{categories.map((item) => <button className={`chip ${category === item ? 'active' : ''}`} type="button" aria-pressed={category === item} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <label className="sr-only" htmlFor="source-filter">Filtrer par source</label><select id="source-filter" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Toutes les sources</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <label className="sr-only" htmlFor="sort-filter">Trier les articles</label><select id="sort-filter" value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">Plus récents</option><option value="source">Par source</option></select>
            <button className="refresh-button" ref={refreshRef} type="button" disabled={fetching} onClick={() => loadFeeds(true)}>{fetching ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}<span>Actualiser</span></button>
          </div>
          <p className="feed-status" role="status" aria-live="polite">{loading ? status : status || <>{filtered.length} articles · {failedFeeds ? <>{failedFeeds} flux indisponible{failedFeeds > 1 ? 's' : ''} · </> : null}actualisation automatique toutes les 15 min</>}</p>
          <div className="article-grid">{loading ? <Skeletons /> : filtered.length ? filtered.map((article) => <ArticleCard key={article.link} article={article} />) : <div className="empty"><strong>Aucun article ne correspond à votre recherche.</strong>Essayez une autre catégorie ou un autre terme.</div>}</div>
        </section>
      </main>

      <footer className="site-footer"><div className="wrap footer-inner"><a className="footer-brand" href="#top"><span className="brand-mark">IA</span> IA•News</a><span>© {new Date().getFullYear()} · Une veille indépendante sur l’intelligence artificielle.</span></div><div className="wrap footer-note">Articles issus de flux RSS publics · Les contenus appartiennent à leurs éditeurs.</div></footer>
    </div>
  )
}
