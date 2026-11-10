// Analyse tolérante de flux RSS 2.0, RSS 1.0 (RDF) et Atom, sans dépendance.
// Node ne fournit pas DOMParser : on extrait les blocs et les balises par expressions
// régulières bornées, ce qui suffit pour des flux d'actualité et ne casse pas sur les
// documents mal formés rencontrés en production.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è',
  agrave: 'à', ccedil: 'ç', ugrave: 'ù', ecirc: 'ê', ocirc: 'ô', icirc: 'î',
  acirc: 'â', uuml: 'ü', ouml: 'ö', auml: 'ä', euro: '€', deg: '°',
}

export function decodeEntities(value = '') {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return ''
  try { return String.fromCodePoint(code) } catch { return '' }
}

export function stripHtml(value = '') {
  return decodeEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

function firstTag(block, names) {
  for (const name of names) {
    const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
    const match = block.match(pattern)
    if (match) return match[1]
  }
  return ''
}

function attr(block, tag, names) {
  for (const name of names) {
    const pattern = new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']+)["']`, 'i')
    const match = block.match(pattern)
    if (match) return match[1]
  }
  return ''
}

export function splitItems(xml) {
  const candidates = []
  for (const tag of ['item', 'entry']) {
    const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
    let match
    while ((match = pattern.exec(xml)) !== null) candidates.push(match[1])
  }
  return candidates
}

export function parseDate(value) {
  if (!value) return null
  const time = new Date(value.trim()).getTime()
  if (!Number.isFinite(time)) return null
  // Une date dans le futur casse le tri : on la ramène à maintenant.
  const now = Date.now()
  return new Date(time > now + 60_000 ? now : time).toISOString()
}

function pickImage(block, rawDescription) {
  const direct = attr(block, 'enclosure', ['url'])
    || attr(block, 'media:content', ['url'])
    || attr(block, 'media:thumbnail', ['url'])
    || attr(block, 'itunes:image', ['href'])
  if (direct) return normaliseUrl(direct)
  const html = rawDescription || ''
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return img ? normaliseUrl(img[1]) : ''
}

export function normaliseUrl(value = '') {
  try {
    const url = new URL(decodeEntities(value).trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

// Renvoie [{ title, description, link, date, image, rawDate }] sans filtre de pertinence.
export function parseFeed(xml) {
  if (typeof xml !== 'string' || xml.length < 80) return []
  return splitItems(xml).map((block) => {
    const title = stripHtml(firstTag(block, ['title']))
    const rawDescription = firstTag(block, ['description', 'summary', 'content:encoded', 'content'])
    const richContent = firstTag(block, ['content:encoded', 'content'])
    const description = stripHtml(rawDescription)
    const atomLink = attr(block, 'link', ['href'])
    const link = normaliseUrl(atomLink || stripHtml(firstTag(block, ['link', 'guid', 'id'])))
    const rawDate = stripHtml(firstTag(block, ['pubDate', 'published', 'updated', 'date', 'dc:date']))
    if (!title || !link) return null
    return {
      title,
      description: description.slice(0, 600),
      link,
      date: parseDate(rawDate),
      image: pickImage(block, rawDescription) || pickImage(block, richContent),
      rawDate,
    }
  }).filter(Boolean)
}

// Détecte la langue déclarée par le flux, sinon null.
export function feedLanguage(xml) {
  const match = xml.match(/<language>([^<]{2,12})<\/language>/i) || xml.match(/xml:lang=["']([a-z]{2})/i)
  const code = match?.[1]?.trim().toLowerCase().slice(0, 2)
  return code && /^[a-z]{2}$/.test(code) ? code : null
}
