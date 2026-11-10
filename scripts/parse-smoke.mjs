import { parseFeed, feedLanguage } from './feed-parse.mjs'
const feeds = [
  ['Numerama', 'https://www.numerama.com/feed/'],
  ['TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'],
  ['OpenAI', 'https://openai.com/news/rss.xml'],
  ['Heise', 'https://www.heise.de/rss/heise-atom.xml'],
]
for (const [name, url] of feeds) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IA-News/2.0' }, signal: AbortSignal.timeout(15000) })
    const xml = await r.text()
    const items = parseFeed(xml)
    console.log(`${name}: HTTP ${r.status} lang=${feedLanguage(xml)} items=${items.length}`)
    for (const it of items.slice(0, 2)) console.log(`   - ${it.title.slice(0, 70)} | ${it.date} | img=${it.image ? 'y' : 'n'} | desc=${it.description.length}`)
  } catch (e) { console.log(`${name}: ERR ${e.message}`) }
}
