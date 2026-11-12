import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, LoaderCircle, X } from 'lucide-react'
import './reader.css'
import {
  cleanBlocks, fetchArticleText, readCached, translateBlocks, translateProxy, writeCached,
} from '../reader.js'
import { readerLede } from '../lib/format.js'

// Lecteur de traduction immersive, chargé à la demande (React.lazy) : le code
// d'extraction et de traduction ne pèse pas sur le chargement initial.
export default function Reader({ article, onClose }) {
  const dialogRef = useRef(null)
  const abortRef = useRef(null)
  const [state, setState] = useState(() => {
    const cached = readCached(article.id)
    return {
      status: cached ? 'ready' : 'loading',
      blocks: cached?.blocks || [],
      progress: 0,
      error: '',
    }
  })

  useEffect(() => {
    const node = dialogRef.current
    if (node && !node.open) node.showModal()
    document.documentElement.classList.add('reader-open')
    return () => {
      document.documentElement.classList.remove('reader-open')
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'loading') return undefined
    const controller = new AbortController()
    abortRef.current = controller
    ;(async () => {
      try {
        const raw = await fetchArticleText(article.link, controller.signal)
        const blocks = cleanBlocks(raw, article)
        if (blocks.length < 3) throw new Error('article non extractible')
        const translated = await translateBlocks(blocks, {
          signal: controller.signal,
          onProgress: (done, total) => setState((current) => ({ ...current, progress: done / total })),
        })
        if (controller.signal.aborted) return
        writeCached(article.id, translated)
        setState({ status: 'ready', blocks: translated, progress: 1, error: '' })
      } catch (cause) {
        if (controller.signal.aborted) return
        setState({ status: 'error', blocks: [], progress: 0, error: cause.message })
      }
    })()
    return () => controller.abort()
  }, [article, state.status])

  const close = () => dialogRef.current?.close()

  return (
    <dialog
      className="reader"
      ref={dialogRef}
      onClose={onClose}
      aria-modal="true"
      aria-labelledby="reader-title"
    >
      <div className="reader-panel">
        <header className="reader-head">
          <div className="reader-title-block">
            <p className="reader-kicker">Traduction automatique · {article.source}</p>
            <h2 id="reader-title">{article.title}</h2>
          </div>
          <div className="reader-tools">
            <a className="button button-ghost" href={article.link} target="_blank" rel="noopener noreferrer">
              Original <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <button className="ghost-button" type="button" onClick={close} aria-label="Fermer la lecture">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="reader-body">
          {state.status === 'loading' ? (
            <div className="reader-loading" role="status" aria-live="polite">
              {readerLede(article.description) ? <p className="reader-lede">{readerLede(article.description)}</p> : null}
              <p className="reader-progress">
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
                Extraction et traduction de l’article…{state.progress ? ` ${Math.round(state.progress * 100)} %` : ''}
              </p>
              <div className="reader-skeleton" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
              </div>
            </div>
          ) : state.status === 'error' ? (
            <div className="reader-error">
              <strong>La traduction immersive n’a pas abouti.</strong>
              <p>{state.error}. L’article reste lisible via Google Traduction ou chez l’éditeur.</p>
              <div className="reader-actions">
                <a className="button button-solid" href={translateProxy(article.link)} target="_blank" rel="noopener noreferrer">
                  Lire via Google Traduction <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                <a className="button button-ghost" href={article.link} target="_blank" rel="noopener noreferrer">
                  Ouvrir l’original
                </a>
              </div>
            </div>
          ) : (
            <article className="reader-content">
              {readerLede(article.description) ? <p className="reader-lede">{readerLede(article.description)}</p> : null}
              {state.blocks.map((block, index) => <p key={index}>{block}</p>)}
            </article>
          )}
        </div>

        <footer className="reader-foot">
          <span>Traduction automatique à la demande. L’original fait foi.</span>
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            {article.source} <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </dialog>
  )
}
