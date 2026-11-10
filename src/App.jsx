import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Masthead from './components/Masthead.jsx'
import Hero from './components/Hero.jsx'
import Ticker from './components/Ticker.jsx'
import Radar from './components/Radar.jsx'
import Selection from './components/Selection.jsx'
import Feed from './components/Feed.jsx'
import Sources from './components/Sources.jsx'
import Footer from './components/Footer.jsx'
import { useSnapshot } from './hooks/useSnapshot.js'
import { useTheme } from './hooks/useTheme.js'
import { useFilters } from './hooks/useFilters.js'
import { useReveal } from './hooks/useReveal.js'

// Le lecteur d'articles traduits est chargé au premier clic : son code
// d'extraction et de traduction reste hors du bundle initial.
const Reader = lazy(() => import('./components/Reader.jsx'))

export default function App() {
  const { snapshot, error, loading, refreshing, reload } = useSnapshot()
  const { theme, toggle } = useTheme()
  const allArticles = useMemo(
    () => (Array.isArray(snapshot?.articles) ? snapshot.articles : []),
    [snapshot],
  )
  const filters = useFilters(allArticles)
  const sources = useMemo(
    () => (Array.isArray(snapshot?.sources) ? snapshot.sources : []),
    [snapshot],
  )

  const articles = filters.filtered
  const total = articles.length
  const updatedAt = snapshot?.updatedAt ? new Date(snapshot.updatedAt) : null

  // « À la une » reste la tête d'édition, indépendante des filtres. Le reste de
  // la page déroule l'édition sans répétition : une, sélection, puis le fil.
  const headline = allArticles[0] || null
  const edition = useMemo(
    () => (headline ? articles.filter((article) => article.link !== headline.link) : articles),
    [articles, headline],
  )
  const lead = edition[0] || null
  const selection = edition.slice(1, 7)
  const feed = edition.slice(7)

  const stats = useMemo(() => {
    const langs = new Set(allArticles.map((article) => article.sourceLang).filter(Boolean))
    const countries = new Set(sources.map((entry) => entry.country).filter(Boolean))
    return {
      articles: allArticles.length,
      sources: sources.filter((entry) => entry.status !== 'error').length || sources.length,
      languages: langs.size,
      countries: countries.size,
      translated: allArticles.filter((article) => article.translated).length,
    }
  }, [allArticles, sources])

  const [menuOpen, setMenuOpen] = useState(false)
  const [readerArticle, setReaderArticle] = useState(null)
  const searchRef = useRef(null)
  useReveal()

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key === 'Escape') {
        filters.setQuery('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filters.setQuery])

  const openReader = useCallback((event, article) => {
    if (!article.translated) return
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setReaderArticle(article)
  }, [])

  const closeReader = useCallback(() => setReaderArticle(null), [])

  const online = !error && allArticles.length > 0
  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now())

  return (
    <div className="shell">
      <a className="skip-link" href="#fil">Aller au fil d’actualité</a>

      <Masthead
        online={online}
        today={today}
        updatedAt={updatedAt}
        query={filters.query}
        onQuery={filters.setQuery}
        theme={theme}
        onTheme={toggle}
        menuOpen={menuOpen}
        onMenu={setMenuOpen}
        searchRef={searchRef}
      />

      <main id="top">
        <Hero headline={headline} stats={stats} loading={loading} onOpen={openReader} onReload={reload} />
        <Ticker sources={sources} />
        <Radar
          categories={filters.categories}
          active={filters.category}
          onSelect={(name) => filters.set('category', name)}
          sourceCount={stats.sources}
          countryCount={stats.countries}
        />
        <Selection
          lead={lead}
          selection={selection}
          loading={loading}
          total={total}
          onOpen={openReader}
        />
        <Feed
          filters={filters}
          feed={feed}
          total={total}
          articleCount={stats.articles}
          loading={loading}
          refreshing={refreshing}
          error={error}
          translatedCount={stats.translated}
          onOpen={openReader}
          onRefresh={reload}
        />
        <Sources sources={sources} />
      </main>

      <Footer stats={stats} updatedAt={updatedAt} />

      {readerArticle ? (
        <Suspense fallback={null}>
          <Reader key={readerArticle.id} article={readerArticle} onClose={closeReader} />
        </Suspense>
      ) : null}
    </div>
  )
}
