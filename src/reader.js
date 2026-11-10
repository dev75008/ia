// Lecture immersive : extraction du texte de l'article via Jina Reader, puis
// traduction à la demande vers le français via l'endpoint public de Google
// Traduction (CORS ouvert). Rien n'est stocké côté site : le texte est extrait
// au moment du clic, gardé en session, et l'original reste la référence.

const READER_ENDPOINT = 'https://r.jina.ai/'
const TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const CACHE_PREFIX = 'ianews-reader-v1:'
const MAX_CHARS = 30000
const CHUNK_CHARS = 1200

const JUNK = [
  /^title:/i,
  /^url source:/i,
  /^published time:/i,
  /^markdown content:/i,
  /^to play this video/i,
  /^this video can not be played/i,
  /^figure caption/i,
  /^image source/i,
  /^image \d+:/i,
  /^getty images$/i,
  /^advertisement$/i,
  /^by\s*[a-z]/i,
  /^published$/i,
  /^\d{1,2}\s+\w+\s+\d{4}$/i,
  /^\d+\s*(minute|hour|day)s?\s+ago$/i,
  /^related topics$/i,
  /^share this article$/i,
  /^follow us/i,
]

// URL de la page traduite par Google (utilisée en repli si l'extraction échoue).
export function translateProxy(link) {
  try {
    const url = new URL(link)
    const host = url.host.replace(/\./g, '-')
    const query = new URLSearchParams(url.search)
    query.set('_x_tr_sl', 'auto')
    query.set('_x_tr_tl', 'fr')
    query.set('_x_tr_hl', 'fr')
    return `https://${host}.translate.goog${url.pathname}?${query}`
  } catch {
    return link
  }
}

function withTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function requestReader(link, headers, signal) {
  const response = await fetch(READER_ENDPOINT + link, {
    headers,
    signal: withTimeout(signal, 30000),
  })
  if (!response.ok) throw new Error(`lecture HTTP ${response.status}`)
  const text = await response.text()
  if (text.trim().length < 400) throw new Error('article trop court')
  return text
}

// Jina accepte un sélecteur CSS pour isoler le corps de l'article ; on essaie
// les conteneurs les plus courants avant de retomber sur la page entière.
export async function fetchArticleText(link, signal) {
  const attempts = [
    { 'x-target-selector': 'main', 'x-return-format': 'text' },
    { 'x-target-selector': 'article', 'x-return-format': 'text' },
    { 'x-target-selector': '[role="main"]', 'x-return-format': 'text' },
    { 'x-return-format': 'text' },
  ]
  let lastError = null
  for (const headers of attempts) {
    try {
      return await requestReader(link, headers, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }
  throw lastError || new Error('extraction impossible')
}

// Nettoie le texte extrait : retire la navigation, les légendes, les dates de
// publication et les modules « articles liés » qui polluent les pieds de page.
// Le corps commence au premier vrai paragraphe : tout ce qui précède (menus,
// titres de rubriques, signatures) est du décor de page.
export function cleanBlocks(text, article) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const firstParagraph = lines.findIndex((line) => line.length >= 90)
  const start = firstParagraph > 0 ? firstParagraph : 0
  const blocks = []
  let total = 0
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^related topics$/i.test(line)) break
    if (JUNK.some((pattern) => pattern.test(line))) {
      if (/^published$/i.test(line)) index += 1
      continue
    }
    if (index + 1 < lines.length && /^published$/i.test(lines[index + 1])) continue
    if (line.length < 2 || line === article.title) continue
    blocks.push(line)
    total += line.length
    if (total >= MAX_CHARS) break
  }
  return blocks
}

async function translateChunk(text, signal) {
  const url = `${TRANSLATE_ENDPOINT}?client=gtx&sl=auto&tl=fr&dt=t&q=${encodeURIComponent(text)}`
  const response = await fetch(url, { signal: withTimeout(signal, 20000) })
  if (!response.ok) throw new Error(`traduction HTTP ${response.status}`)
  const data = await response.json()
  const translated = (data?.[0] || []).map((segment) => segment?.[0] || '').join('')
  if (!translated.trim()) throw new Error('traduction vide')
  return translated
}

// Regroupe les paragraphes par paquets pour limiter le nombre de requêtes ;
// l'endpoint conserve les doubles sauts de ligne, ce qui permet de retrouver
// la structure d'origine au retour.
export async function translateBlocks(blocks, { signal, onProgress } = {}) {
  const groups = []
  let current = []
  let length = 0
  for (const block of blocks) {
    if (length + block.length > CHUNK_CHARS && current.length) {
      groups.push(current)
      current = []
      length = 0
    }
    current.push(block)
    length += block.length + 2
  }
  if (current.length) groups.push(current)

  const results = new Array(groups.length)
  let cursor = 0
  let done = 0

  const worker = async () => {
    while (cursor < groups.length) {
      const index = cursor
      cursor += 1
      results[index] = await translateChunk(groups[index].join('\n\n'), signal)
      done += 1
      onProgress?.(done, groups.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, worker))
  return results.flatMap((text) => text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean))
}

export function readCached(id) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.blocks) && parsed.blocks.length ? parsed : null
  } catch {
    return null
  }
}

export function writeCached(id, blocks) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ blocks, at: Date.now() }))
  } catch {
    // quota plein : la lecture reste possible, simplement non mémorisée
  }
}
