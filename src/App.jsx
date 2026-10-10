import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight, Clock3, LoaderCircle, Moon, RefreshCw, Search, Sun, Sparkles } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

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
const CACHE_KEY = 'ianews-react-feed-v1'
const CACHE_TTL = 15 * 60 * 1000
const REFRESH_MS = 15 * 60 * 1000

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
  const [sort, setSort] = useState('date')
  const [theme, setTheme] = useState(() => localStorage.getItem('ianews-theme') || 'dark')
  const [lastFetch, setLastFetch] = useState(null)
  const [failedFeeds, setFailedFeeds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [status, setStatus] = useState('Chargement des flux d’actualité…')
  const rootRef = useRef(null)
  const refreshRef = useRef(null)
  const fetchingRef = useRef(false)
  const hasIntroAnimated = useRef(false)

  const loadFeeds = useCallback(async (force = false) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setFetching(true)
    setStatus('Récupération des dernières actualités…')
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
        if (cached && Date.now() - cached.saved < CACHE_TTL && Array.isArray(cached.articles)) {
          setArticles(cached.articles)
          setLastFetch(cached.saved)
          setFailedFeeds(cached.failed || 0)
          setLoading(false)
          setFetching(false)
          fetchingRef.current = false
          return
        }
      } catch { /* Cache absent ou invalide : on recharge les sources. */ }
    }
    const results = await Promise.allSettled(FEEDS.map(fetchFeed))
    let failures = 0
    const collected = []
    results.forEach((result) => {
      if (result.status === 'fulfilled') collected.push(...result.value)
      else failures += 1
    })
    const seen = new Set()
    const merged = collected.filter((article) => {
      const key = (article.link || article.title).toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
    const saved = Date.now()
    setArticles(merged)
    setLastFetch(saved)
    setFailedFeeds(failures)
    setLoading(false)
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ saved, articles: merged, failed: failures })) } catch { /* Le site continue sans cache si le stockage est plein. */ }
    setStatus(merged.length ? '' : `Aucun article reçu · ${failures} flux indisponible${failures > 1 ? 's' : ''}. Réessayez dans un instant.`)
    setFetching(false)
    fetchingRef.current = false
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080a12' : '#f7f8fc')
    try { localStorage.setItem('ianews-theme', theme) } catch { /* Préférence limitée à la session. */ }
  }, [theme])

  useEffect(() => {
    loadFeeds()
    const timer = window.setInterval(() => loadFeeds(true), REFRESH_MS)
    const clock = window.setInterval(() => setLastFetch((value) => value), 60000)
    return () => { window.clearInterval(timer); window.clearInterval(clock) }
  }, []) // Chargement initial et actualisation périodique.

  useEffect(() => {
    if (loading || hasIntroAnimated.current) return
    hasIntroAnimated.current = true
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
      intro.from('.header-inner', { y: -18, opacity: 0, duration: 0.75 })
        .from('.hero .eyebrow', { y: 15, opacity: 0, duration: 0.5 }, '-=0.35')
        .from('.hero-title', { y: 32, opacity: 0, duration: 0.85 }, '-=0.25')
        .from('.hero-copy, .hero-stats', { y: 16, opacity: 0, duration: 0.55, stagger: 0.12 }, '-=0.4')
      gsap.utils.toArray('.reveal-section').forEach((section) => gsap.from(section, {
        y: 28,
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power2.out',
        scrollTrigger: { trigger: section, start: 'top 90%', once: true },
      }))
      ScrollTrigger.refresh()
    }, rootRef)
    return () => ctx.revert()
  }, [loading])

  useEffect(() => {
    if (!articles.length) return
    const cards = gsap.utils.toArray('.article-card')
    gsap.fromTo(cards, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55, stagger: 0.075, ease: 'power3.out', overwrite: 'auto' })
    const trendCards = gsap.utils.toArray('.trend-card')
    gsap.fromTo(trendCards, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.09, ease: 'power3.out', overwrite: 'auto' })
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
      <header className="site-header glass">
        <div className="wrap header-inner">
          <a className="brand" href="#top" aria-label="IA News, accueil"><span className="brand-mark">IA</span><span>IA<span className="brand-dot">•</span>News</span></a>
          <label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">Rechercher dans les actualités</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une actualité…" /></label>
          <button className="icon-button" type="button" aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="eyebrow"><span className="live-dot" /> veille francophone · en direct</div>
          <h1 className="hero-title">L’IA en français,<br /><span className="gradient-text">en temps réel.</span></h1>
          <p className="hero-copy">Les idées, les annonces et les avancées qui façonnent l’intelligence artificielle. Toute l’actualité francophone, réunie au même endroit.</p>
          <div className="hero-stats"><span><strong>{articles.length.toLocaleString('fr-FR')}</strong> articles</span><i /><span>Mis à jour <strong>{lastFetch ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(lastFetch) : 'au démarrage'}</strong></span><i /><span>{new Set(articles.map((article) => article.source)).size || FEEDS.length} sources</span></div>
        </section>

        <section className="trending wrap reveal-section" aria-labelledby="trending-title">
          <div className="section-heading"><div><span className="section-eyebrow">SÉLECTION DU MOMENT</span><h2 id="trending-title">À la une<span className="heading-period">.</span></h2><p>Les dernières nouvelles à ne pas manquer.</p></div><span className="section-index">01 — 05</span></div>
          <div className="trend-grid">{loading ? <Skeletons count={5} /> : trending.length ? trending.map((article, index) => <a className="trend-card glass" href={article.link} target="_blank" rel="noopener noreferrer" key={article.link}><span className="trend-number">0{index + 1}</span><h3>{article.title}</h3><span className="trend-source">{article.source} · {relativeDate(article.date)}</span><ArrowUpRight className="trend-arrow" size={15} aria-hidden="true" /></a>) : <div className="empty trend-empty">Les tendances apparaîtront dès réception des flux.</div>}</div>
        </section>

        <section className="feed-section wrap reveal-section" aria-labelledby="feed-title">
          <div className="section-heading feed-heading"><div><span className="section-eyebrow">LE DIRECT</span><h2 id="feed-title">Le fil de l’IA<span className="heading-period">.</span></h2><p>Tout ce qui se passe, sélectionné pour vous.</p></div><span className="section-index">{String(filtered.length).padStart(2, '0')} ARTICLES</span></div>
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

      <footer className="site-footer"><div className="wrap footer-inner"><a className="footer-brand" href="#top"><span className="brand-mark">IA</span> IA•News</a><span>© {new Date().getFullYear()} · Une veille indépendante sur l’intelligence artificielle.</span><a className="footer-link" href="https://github.com/dev75008/ia" target="_blank" rel="noopener noreferrer">Le projet sur GitHub <ArrowUpRight size={13} /></a></div><div className="wrap footer-note">Articles issus de flux RSS publics · Les contenus appartiennent à leurs éditeurs.</div></footer>
    </div>
  )
}
