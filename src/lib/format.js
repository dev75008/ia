const LANGUAGE_NAMES = {
  fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien',
  pt: 'Portugais', nl: 'Néerlandais', ja: 'Japonais', zh: 'Chinois', ko: 'Coréen',
  ru: 'Russe', ar: 'Arabe', tr: 'Turc', pl: 'Polonais', sv: 'Suédois',
}

export function languageName(code) {
  return LANGUAGE_NAMES[code] || (code ? code.toUpperCase() : '—')
}

export function relativeDate(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time) || time <= 0) return 'date inconnue'
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(time)
}

export function clockLabel(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function readMinutes(text = '') {
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200))
}

// Le résumé du flux est coupé à 420 caractères : on préfère une phrase entière,
// ou rien, plutôt qu'un chapô interrompu en plein mot dans le lecteur.
export function readerLede(text = '') {
  if (!text) return ''
  if (text.length < 300) return text
  const cut = text.slice(0, 420)
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('。'),
  )
  return end >= 200 ? cut.slice(0, end + 1) : ''
}
