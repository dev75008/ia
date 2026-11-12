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
import { feedLanguage, decodeEntities, parseFeed } from './feed-parse.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const SNAPSHOT = path.join(root, 'public', 'feed-snapshot.json')
const CACHE = path.join(root, 'data', 'translations.json')
const IMAGES_CACHE = path.join(root, 'data', 'images.json')
const SOURCES_FILE = path.join(root, 'data', 'sources.json')

const args = process.argv.slice(2)
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7)
const limit = Number(args.find((arg) => arg.startsWith('--limit='))?.slice(8)) || 24
const translateEnabled = !args.includes('--no-translate')
const EDITION_SIZE = 280
// Seuils de santé d'une édition. En dessous, on refuse d'écrire : une panne
// générale des flux ne doit pas remplacer le site par une page vide.
const MIN_ARTICLES = 100
const MIN_SOURCES_OK = 10

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 IA-News/2.0'
const RELEVANT = /(\bia\b|\bai\b|intelligence artificielle|ia générative|ia agentique|machine learning|apprentissage automatique|deep learning|llm|modèle de langage|agents? intelligents?|chatgpt|openai|anthropic|mistral|gemini|llama|copilot|gpt-|claude|nvidia|robotique|humanoïde|informatique quantique|quantum computing|semi-conducteur|puces? ia|人工智能|生成式|大模型|大语言模型|机器学习|深度学习|智能体|多模态|算法|算力|芯片|半导体|机器人|人形机器人|自动驾驶|数据中心|英伟达|黄仁勋|谷歌|字节跳动|豆包|百度|文心|阿里|通义|腾讯|混元|华为|昇腾|月之暗面|智谱|商汤|科大讯飞)/i

const CATEGORIES = [
  ['Sécurité', /cyberattaque|cybersécurité|sécurité|vulnérabilité|piratage|deepfake|fraude|malware|faille|安全|攻击|漏洞|黑客|诈骗|深度伪造|隐私|勒索/i],
  ['Régulation', /réglement|régul|loi\b|ai act|ai act|textes?|législat|éthique|droit|commission européenne|tribunal|cnil|rgpd|procès|监管|法规|政策|法律|合规|欧盟|反垄断|诉讼|立法/i],
  ['Robotique', /robot|humanoïde|autonom|drone|robotique|véhicule autonome|机器人|人形|自动驾驶|无人机|具身|机械臂/i],
  ['Recherche', /recherche|chercheur|étude|scientifi|universit|institut|laboratoire|papier|arxiv|benchmark|entraînement|dataset|研究|论文|科学家|实验室|大学|基准|训练|数据集|开源/i],
  ['Entreprise', /entreprise|invest|startup|levée de fonds|acquisition|partenariat|déploiement|emploi|marché|bourse|valeurs?|milliards?|rachat|融资|投资|收购|上市|公司|企业|合作|营收|估值|裁员|创业/i],
  ['Modèles', /génératif|chatgpt|openai|anthropic|mistral|gemini|llama|copilot|gpt-|modèle|claude|diffusion|multimodal|fine-tun|大模型|生成式|多模态|推理|智能体|算法|文心|通义|豆包|混元/i],
  ['Matériel', /nvidia|gpu\b|tpu\b|puces?|semi-conducteur|datacenter|data center|refroidissement|arm\b|tsmc|gravure|芯片|半导体|算力|数据中心|英伟达|台积电|存储|服务器/i],
  ['Société', /société|sociétal|formation|école|éducation|santé|hôpital|art|culture|média|opinion|public|citoyen|consommateur|教育|医疗|就业|社会|文化|用户|生活/i],
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

/* --------------------------------------------------------------- vignettes */
// Beaucoup de flux ne publient pas d'image. On complète en lisant l'og:image de
// la page d'article, avec un cache persistant et un budget par exécution pour
// ne pas transformer l'édition en crawl.

const IMAGE_BUDGET = 280

function readImageCache() {
  try { return JSON.parse(readFileSync(IMAGES_CACHE, 'utf8')) } catch { return {} }
}

async function pageImage(link) {
  try {
    const response = await fetch(link, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) return ''
    const html = (await response.text()).slice(0, 500_000)
    const patterns = [
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
      /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (!match) continue
      try {
        const image = new URL(decodeEntities(match[1]), link)
        if (image.protocol === 'http:' || image.protocol === 'https:') return image.href
      } catch { /* URL invalide */ }
    }
  } catch { /* page inaccessible : la carte gardera son visuel de secours */ }
  return ''
}

async function enrichImages(items) {
  const cache = readImageCache()
  const now = Date.now()
  const missing = items.filter((item) => !item.image)
  let analysed = 0
  let completed = 0

  await pool(missing.slice(0, IMAGE_BUDGET), 6, async (item) => {
    const hit = cache[item.link]
    const ttl = hit?.image ? 14 : 3
    if (hit?.at && now - Date.parse(hit.at) < ttl * 864e5) {
      if (hit.image) { item.image = hit.image; completed += 1 }
      return
    }
    const image = await pageImage(item.link)
    cache[item.link] = { image, at: new Date().toISOString() }
    analysed += 1
    if (image) { item.image = image; completed += 1 }
  })

  for (const [key, value] of Object.entries(cache)) {
    if (!value?.at || now - Date.parse(value.at) > 30 * 864e5) delete cache[key]
  }
  await mkdir(path.dirname(IMAGES_CACHE), { recursive: true })
  await writeFile(IMAGES_CACHE, JSON.stringify(cache), 'utf8')
  console.log(`→ vignettes : ${completed} complétées, ${analysed} pages analysées (budget ${IMAGE_BUDGET})`)
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

  await enrichImages(selected)

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

  // Contrôle avant écriture : sous le seuil, le script échoue, le workflow est
  // marqué en erreur et n'écrase pas la dernière édition publiée.
  const ok = snapshot.sources.filter((source) => source.status === 'ok').length
  if (articles.length < MIN_ARTICLES || ok < MIN_SOURCES_OK) {
    throw new Error(`édition sous le seuil : ${articles.length} articles, ${ok}/${fetched.length} sources valides — snapshot non écrit`)
  }

  await mkdir(path.dirname(SNAPSHOT), { recursive: true })
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 1), 'utf8')
  console.log(`\n✓ ${articles.length} articles · ${ok}/${fetched.length} sources · ${snapshot.translatedCount} traduits`)
  console.log(`  écrit dans ${path.relative(root, SNAPSHOT)} (${(JSON.stringify(snapshot).length / 1024).toFixed(0)} Ko)`)
}

main().catch((error) => {
  console.error(`Échec : ${error.message}`)
  process.exitCode = 1
})
