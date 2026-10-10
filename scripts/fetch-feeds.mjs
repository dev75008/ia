import { mkdir, writeFile } from 'node:fs/promises'

const feeds = [
  { name: 'Le Monde Informatique', url: 'https://www.lemondeinformatique.fr/flux-rss/thematique/intelligence-artificielle/rss.xml' },
  { name: 'Journal du Net', url: 'https://www.journaldunet.com/intelligence-artificielle/rss/' },
  { name: 'L’Usine Digitale', url: 'https://www.usine-digitale.fr/rss' },
  { name: 'ActuIA', url: 'https://www.actuia.com/feed/' },
  { name: 'Siècle Digital', url: 'https://siecledigital.fr/feed/' },
  { name: 'Numerama', url: 'https://www.numerama.com/feed/' },
  { name: 'LeBigData', url: 'https://www.lebigdata.fr/feed' },
  { name: 'Numerama · IA', url: 'https://www.numerama.com/tag/intelligence-artificielle/feed/' },
]
const relevant = /\bIA\b|intelligence artificielle|ia générative|ia agentique|chatgpt|openai|anthropic|mistral|gemini|llama|copilot|gpt-[\w.]+|modèle[s]? de langage|large language model|\bllm\b|machine learning|apprentissage automatique|deep learning|robotique|humanoïde|agent[s]? intelligent[s]?/i

function stripHtml(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim()
}

function category(text) {
  const value = text.toLowerCase()
  if (/réglement|régul|loi|ai act|législat|éthique|droit|commission européenne/.test(value)) return 'Régulation'
  if (/robot|humanoïde|autonom|drone|robotique/.test(value)) return 'Robotique'
  if (/recherche|chercheur|étude|scientifi|université|laboratoire|modèle de langage|llm/.test(value)) return 'Recherche'
  if (/entreprise|invest|startup|levée|acquisition|partenariat|déploi|emploi|marché/.test(value)) return 'Entreprise'
  if (/générat|chatgpt|openai|anthropic|mistral|gemini|llama|image|vidéo|copilot|gpt-/.test(value)) return 'Modèles génératifs'
  return 'Actualité'
}

async function getFeed(feed) {
  try {
    const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (result.status !== 'ok' || !Array.isArray(result.items)) throw new Error(result.message || 'Flux invalide')
    return result.items.map((item) => {
      const title = stripHtml(item.title)
      let link
      try { link = new URL(item.link || item.guid).href } catch { return null }
      if (!title || !/^https?:/.test(link)) return null
      const description = stripHtml(item.description || item.content || '').slice(0, 420)
      if (!relevant.test(`${title} ${description}`)) return null
      const parsedDate = new Date(item.pubDate || item.isoDate || 0)
      const image = item.thumbnail || item.enclosure?.link || ''
      return {
        title, link, description,
        date: Number.isNaN(parsedDate.getTime()) ? new Date(0).toISOString() : parsedDate.toISOString(),
        source: feed.name, feedUrl: feed.url, image, category: category(`${title} ${description}`),
      }
    }).filter(Boolean)
  } catch (error) {
    console.warn(`Flux ignoré (${feed.name}): ${error.message}`)
    return []
  }
}

const all = (await Promise.all(feeds.map(getFeed))).flat()
const seen = new Set()
const articles = all.filter((item) => {
  const key = item.link.toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '')
  if (seen.has(key)) return false
  seen.add(key)
  return true
}).sort((a, b) => new Date(b.date) - new Date(a.date))

await mkdir('public', { recursive: true })
await writeFile('public/feed-snapshot.json', JSON.stringify({ updatedAt: new Date().toISOString(), articles }, null, 2))
console.log(`Flux statique généré : ${articles.length} articles, ${feeds.length} sources.`)
