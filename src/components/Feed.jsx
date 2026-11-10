import { ArrowDown, Layers3, LoaderCircle } from 'lucide-react'
import ArticleCard from './ArticleCard.jsx'
import SkeletonGrid from './SkeletonGrid.jsx'

export default function Feed({
  filters,
  feed,
  total,
  articleCount,
  loading,
  refreshing,
  error,
  translatedCount,
  onOpen,
  onRefresh,
}) {
  const { category, source, scope, sort, categories, availableSources, visible, set, reset, more } = filters

  return (
    <section className="feed reveal" id="fil" aria-labelledby="fil-title">
      <div className="wrap">
        <div className="section-head section-head-split">
          <div>
            <p className="kicker">Le fil</p>
            <h2 id="fil-title">Toute l’actualité</h2>
          </div>
          <button className="button button-ghost refresh" type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <LoaderCircle className="spin" size={14} /> : <Layers3 size={14} />}
            Actualiser
          </button>
        </div>

        <div className="toolbar">
          <div className="chips" role="group" aria-label="Filtrer par catégorie">
            <button
              type="button"
              className={`chip${category === 'Toutes' ? ' is-active' : ''}`}
              aria-pressed={category === 'Toutes'}
              onClick={() => set('category', 'Toutes')}
            >
              Toutes <span>{articleCount}</span>
            </button>
            {categories.map((item) => (
              <button
                type="button"
                key={item.name}
                className={`chip${category === item.name ? ' is-active' : ''}`}
                aria-pressed={category === item.name}
                onClick={() => set('category', item.name)}
              >
                {item.name} <span>{item.count}</span>
              </button>
            ))}
          </div>

          <div className="filters">
            <label className="select">
              <span className="sr-only">Filtrer par source</span>
              <select value={source} onChange={(event) => set('source', event.target.value)}>
                <option value="all">Toutes les sources</option>
                {availableSources.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>

            <label className="select">
              <span className="sr-only">Filtrer par langue d’origine</span>
              <select value={scope} onChange={(event) => set('scope', event.target.value)}>
                <option value="all">Toutes les langues</option>
                <option value="translated">Traduits en français</option>
                <option value="original">Publiés en français</option>
              </select>
            </label>

            <label className="select">
              <span className="sr-only">Trier les articles</span>
              <select value={sort} onChange={(event) => set('sort', event.target.value)}>
                <option value="date">Plus récents</option>
                <option value="source">Par source</option>
              </select>
            </label>
          </div>
        </div>

        <p className="status" role="status" aria-live="polite">
          {error && !articleCount
            ? <>Édition indisponible ({error}). Réessayez dans quelques minutes.</>
            : <>{total} article{total > 1 ? 's' : ''}{translatedCount ? ` · ${translatedCount} traduits vers le français` : ''} · actualisation automatique toutes les 15 min</>}
        </p>

        <div className="story-grid">
          {loading ? <SkeletonGrid count={9} /> : feed.length ? (
            feed.slice(0, visible).map((article, index) => (
              <ArticleCard article={article} index={index} key={article.link} onOpen={onOpen} />
            ))
          ) : (
            <div className="empty">
              <strong>{total ? 'Cette vue tient dans la sélection ci-dessus.' : 'Aucun article ne correspond à cette vue.'}</strong>
              <p>
                {total
                  ? 'Élargissez les filtres pour dérouler davantage d’articles.'
                  : 'Changez de catégorie, de source ou effacez la recherche.'}
              </p>
              <button type="button" className="button button-ghost" onClick={reset}>
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>

        {feed.length > visible ? (
          <div className="load-more">
            <button type="button" className="button button-ghost" onClick={more}>
              Afficher {Math.min(36, feed.length - visible)} articles de plus
              <ArrowDown size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
