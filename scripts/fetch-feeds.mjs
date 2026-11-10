// Construit l'édition statique servie par le site : interroge chaque source à la
// source, filtre, déduplique, traduit vers le français ce qui ne l'est pas, puis
// écrit public/feed-snapshot.json.
//
// Usage : node scripts/fetch-feeds.mjs [--only=Nom] [--limit=25] [--no-translate]

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { feedLanguage, parseFeed } from './feed-parse.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const SNAPSHOT = path.join(root, 'public', 'feed-snapshot.json')
const CACHE = path.join(root, 'data', 'translations.json')
const SOURCES_FILE = path.join(root, 'data', 'sources.json')

const args = process.argv.slice(2)
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7)
const limit = Number(args.find((arg) => arg.startsWith('--limit='))?.slice(8)) || 24
const translateEnabled = !args.includes('--no-translate')
const EDITION_SIZE = 240

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 IA-News/2.0'
const RELEVANT = /(\bia\b|intelligence artificielle|ia générative|ia agentique|machine learning|apprentissage automatique|deep learning|llm|modèle de langage|agents? intelligents?|chatgpt|openai|anthropic|mistral|gemini|llama|copilot|gpt-|claude|nvidia|robotique|humanoïde|informatique quantique|quantum computing|semi-conducteur|puces? ia)/i

const CATEGORIES = [
  ['Sécurité', /cyberattaque|cybersécurité|sécurité|vulnérabilité|piratage|deepfake|fraude|malware|faille/i],
  ['Régulation', /réglement|régul|loi\b|ai act|ai act|textes?|législat|éthique|droit|commission européenne|tribunal|cnil|rgpd|procès/i],
  ['Robotique', /robot|humanoïde|autonom|drone|robotique|véhicule autonome/i],
  ['Recherche', /recherche|chercheur|étude|scientifi|universit|institut|laboratoire|papier|arxiv|benchmark|entraînement|dataset/i],
  ['Entreprise', /entreprise|invest|startup|levée de fonds|acquisition|partenariat|déploiement|emploi|marché|bourse|valeurs?|milliards?|rachat/i],
  ['Modèles', /génératif|chatgpt|openai|anthropic|mistral|gemini|llama|copilot|gpt-|modèle|claude|diffusion|multimodal|fine-tun/i],
  ['Matériel', /nvidia|gpu\b|tpu\b|puces?|semi-conducteur|datacenter|data center|refroidissement|arm\b|tsmc|gravure/i],
  ['Société', /société|sociétal|formation|école|éducation|santé|hôpital|art|culture|média|opinion|public|citoyen|consommateur/i],
]

export function categorize(text) {
  const value = text.toLowerCase()
  for (const [name, pattern] of CATEGORIES) if (pattern.test(value)) return name
  return 'Actualité'
}

function canonical(link) {
  try {
    const url = new URL(link)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source|at_)/i.test(key)) url.searchParams.delete(key)
    }
    return url.href.replace(/\/$/, '')
  } catch { return link }
}

async function fetchFeed(entry) {
  const started = Date.now()
  try {
    const response = await fetch(entry.url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(18_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const xml = await response.text()
    if (!/<(item|entry)[\s>]/i.test(xml)) throw new Error('aucun article dans la réponse')
    const items = parseFeed(xml).slice(0, limit)
    if (!items.length) throw new Error('articles illisibles')
    return {
      ...entry,
      declaredLang: feedLanguage(xml) || entry.lang,
      items,
      status: 'ok',
      error: null,
      ms: Date.now() - started,
    }
  } catch (error) {
    return { ...entry, items: [], status: 'error', error: error.message, ms: Date.now() - started }
  }
}

async function pool(entries, size, worker) {
  const results = new Array(entries.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(size, entries.length) }, async () => {
    while (cursor < entries.length) {
      const index = cursor++
      results[index] = await worker(entries[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function loadSources() {
  if (!existsSync(SOURCES_FILE)) throw new Error(`Fichier de sources absent : ${SOURCES_FILE}`)
  return JSON.parse(readFileSync(SOURCES_FILE, 'utf8'))
}

async function main() {
  let sources = loadSources()
  if (only) sources = sources.filter((source) => source.name.toLowerCase() === only.toLowerCase())
  if (!sources.length) throw new Error('Aucune source à interroger')

  console.log(`→ ${sources.length} sources interrogées (limite ${limit} articles/source)`)
  const fetched = await pool(sources, 6, fetchFeed)

  const seen = new Set()
  const collected = []
  for (const feed of fetched) {
    if (feed.status !== 'ok') {
      console.warn(`   ✗ ${feed.name} — ${feed.error}`)
      continue
    }
    let kept = 0
    for (const item of feed.items) {
      const haystack = `${item.title} ${item.description}`
      if (feed.scope !== 'ai' && !RELEVANT.test(haystack)) continue
      const key = canonical(item.link)
      if (seen.has(key)) continue
      seen.add(key)
      collected.push({
        ...item,
        link: key,
        source: feed.name,
        sourceLang: feed.declaredLang || feed.lang || 'fr',
        country: feed.country || null,
        homepage: feed.homepage || null,
      })
      kept += 1
      if (collected.length >= 900) break
    }
    feed.kept = kept
    console.log(`   ${feed.status === 'ok' ? '✓' : '✗'} ${feed.name.padEnd(28)} ${String(kept).padStart(3)} art. ${feed.ms} ms`)
  }

  // L'édition publie les articles les plus récents. La sélection est arrêtée
  // avant la traduction pour que le budget de requêtes profite aux articles
  // réellement affichés, du plus récent au plus ancien.
  const selected = collected
    .slice()
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, EDITION_SIZE)

  const toTranslate = selected.filter((item) => item.sourceLang !== 'fr' && !/^fr/i.test(item.sourceLang))
  let translated = 0
  let cacheStats = { hits: 0, misses: 0 }

  if (translateEnabled && toTranslate.length) {
    try {
      const { translateBatch, createCache } = await import('./translate.mjs')
      const cache = createCache(CACHE)
      const entries = toTranslate.map((item, index) => ({
        id: String(index),
        title: item.title,
        description: item.description.slice(0, 420),
        lang: item.sourceLang,
      }))
      const output = await translateBatch(entries, { to: 'fr', concurrency: 5, cache, budget: 900 })
      const byId = new Map(output.map((entry) => [entry.id, entry]))
      toTranslate.forEach((item, index) => {
        const result = byId.get(String(index))
        if (!result) return
        item.originalTitle = item.title
        item.originalDescription = item.description
        if (result.translated) {
          item.title = result.title || item.title
          item.description = (result.description || item.description).slice(0, 420)
          item.translated = true
          translated += 1
        } else {
          item.translated = false
        }
      })
      cacheStats = cache.stats ? cache.stats() : { hits: 0, misses: 0 }
      console.log(`→ traduction : ${translated}/${toTranslate.length} articles (cache ${cacheStats.hits} hits)`)
    } catch (error) {
      console.warn(`→ traduction indisponible : ${error.message}`)
      toTranslate.forEach((item) => { item.translated = false })
    }
  }

  const articles = selected.map((item) => ({
    id: createHash('sha1').update(item.link).digest('hex').slice(0, 16),
    title: item.title,
    description: item.description,
    originalTitle: item.originalTitle || null,
    link: item.link,
    source: item.source,
    sourceLang: item.sourceLang,
    country: item.country,
    translated: Boolean(item.translated),
    date: item.date,
    image: item.image || null,
    category: categorize(`${item.title} ${item.description}`),
  }))

  // Le compte affiché par source doit correspondre aux articles réellement
  // publiés dans l'édition, pas au nombre d'articles collectés avant la coupe.
  const perSource = new Map()
  for (const article of articles) perSource.set(article.source, (perSource.get(article.source) || 0) + 1)

  const snapshot = {
    updatedAt: new Date().toISOString(),
    articleCount: articles.length,
    sourceCount: fetched.filter((feed) => feed.status === 'ok').length,
    translatedCount: articles.filter((article) => article.translated).length,
    sources: fetched.map((feed) => ({
      name: feed.name,
      url: feed.url,
      homepage: feed.homepage || null,
      lang: feed.declaredLang || feed.lang || 'fr',
      country: feed.country || null,
      scope: feed.scope || 'ai',
      status: feed.status,
      count: perSource.get(feed.name) || 0,
      error: feed.error || null,
    })),
    articles,
  }

  await mkdir(path.dirname(SNAPSHOT), { recursive: true })
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 1), 'utf8')
  const ok = snapshot.sources.filter((source) => source.status === 'ok').length
  console.log(`\n✓ ${articles.length} articles · ${ok}/${fetched.length} sources · ${snapshot.translatedCount} traduits`)
  console.log(`  écrit dans ${path.relative(root, SNAPSHOT)} (${(JSON.stringify(snapshot).length / 1024).toFixed(0)} Ko)`)
}

main().catch((error) => {
  console.error(`Échec : ${error.message}`)
  process.exitCode = 1
})
