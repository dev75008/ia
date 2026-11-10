import { useCallback, useDeferredValue, useEffect, useMemo, useState, startTransition } from 'react'

const CATEGORY_ORDER = ['Modèles', 'Régulation', 'Recherche', 'Entreprise', 'Robotique', 'Société', 'Matériel', 'Sécurité', 'Actualité']
export const PAGE_SIZE = 36

// Tous les filtres de l'édition au même endroit : la recherche est différée
// (l'input reste immédiat), les autres changements passent par une transition
// React pour ne pas bloquer la frappe ou le défilement.
export function useFilters(articles) {
  const [category, setCategory] = useState('Toutes')
  const [source, setSource] = useState('all')
  const [scope, setScope] = useState('all')
  const [sort, setSort] = useState('date')
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const deferredQuery = useDeferredValue(query)

  const categories = useMemo(() => {
    const counts = new Map()
    for (const article of articles) counts.set(article.category, (counts.get(article.category) || 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]) || b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [articles])

  const availableSources = useMemo(
    () => [...new Set(articles.map((article) => article.source))].sort((a, b) => a.localeCompare(b, 'fr')),
    [articles],
  )

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    return articles
      .filter((article) => (category === 'Toutes' || article.category === category)
        && (source === 'all' || article.source === source)
        && (scope === 'all' || (scope === 'translated' ? article.translated : !article.translated))
        && (!needle || `${article.title} ${article.description || ''}`.toLowerCase().includes(needle)))
      .sort((a, b) => (sort === 'source'
        ? a.source.localeCompare(b.source, 'fr') || new Date(b.date) - new Date(a.date)
        : new Date(b.date) - new Date(a.date)))
  }, [articles, category, source, scope, deferredQuery, sort])

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [category, source, scope, sort, deferredQuery])

  const set = useCallback((key, value) => {
    startTransition(() => {
      if (key === 'category') setCategory(value)
      else if (key === 'source') setSource(value)
      else if (key === 'scope') setScope(value)
      else if (key === 'sort') setSort(value)
      else if (key === 'query') setQuery(value)
    })
  }, [])

  const reset = useCallback(() => {
    startTransition(() => {
      setCategory('Toutes')
      setSource('all')
      setScope('all')
      setSort('date')
      setQuery('')
    })
  }, [])

  const more = useCallback(() => setVisible((count) => count + PAGE_SIZE), [])

  return {
    category,
    source,
    scope,
    sort,
    query,
    deferredQuery,
    pendingQuery: query !== deferredQuery,
    categories,
    availableSources,
    filtered,
    visible,
    set,
    setQuery,
    reset,
    more,
  }
}
