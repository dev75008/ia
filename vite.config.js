import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SITE = 'https://actuia.duckdns.org'

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const truncate = (text = '', max = 155) => {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`
}

// Page statique d'un article : URL propre, métadonnées sociales, JSON-LD
// NewsArticle et contenu rendu sans JavaScript. C'est cette URL qui est
// partagée et indexée, pas l'accueil.
function renderArticlePage(article) {
  const title = escapeHtml(article.title)
  const description = escapeHtml(truncate(article.description || article.title))
  const url = `${SITE}/article/${article.id}/`
  const published = article.date || new Date().toISOString()
  const publishedLabel = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(published))
  const image = typeof article.image === 'string' && /^https?:\/\//.test(article.image) ? article.image : ''
  const original = article.originalTitle && article.originalTitle !== article.title
    ? `<p class="original">${escapeHtml(article.originalTitle)}</p>`
    : ''

  const newsArticle = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: truncate(article.description || article.title, 300),
    datePublished: published,
    dateModified: published,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'fr-FR',
    isAccessibleForFree: true,
    isBasedOn: article.link,
    ...(image ? { image: [image] } : {}),
    publisher: { '@id': `${SITE}/#organization` },
    author: { '@type': 'Organization', name: 'IA•News', url: `${SITE}/` },
  }
  const jsonLd = JSON.stringify(newsArticle).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="fr" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${title} — IA•News</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="IA•News" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
    <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
    <script type="application/ld+json">${jsonLd}</script>
    <link rel="icon" href="/favicon.ico" />
    <style>
      :root { --bg:#0b0b0c; --text:#f2f2ef; --muted:#9a9a94; --accent:#c6f24e; --line:#232325; }
      * { box-sizing: border-box; }
      body { margin:0; padding:40px 22px 80px; background:var(--bg); color:var(--text);
        font:400 17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
      main { max-width:70ch; margin:0 auto; }
      .back { display:inline-block; margin-bottom:28px; color:var(--muted); text-decoration:none;
        font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
      .back:hover, a:hover { color:var(--accent); }
      .kicker { margin:0 0 10px; color:var(--accent); font-size:11px; letter-spacing:.16em;
        text-transform:uppercase; }
      h1 { margin:0 0 12px; font-size:clamp(26px,4vw,40px); line-height:1.15; letter-spacing:-.01em; }
      .original { margin:0 0 16px; color:var(--muted); font-style:italic; font-size:15px; }
      .meta { margin:0 0 24px; padding-bottom:20px; border-bottom:1px solid var(--line);
        color:var(--muted); font-size:13px; }
      figure { margin:0 0 26px; }
      img { width:100%; height:auto; border-radius:6px; display:block; }
      .lede { font-size:19px; color:#d8d8d2; }
      .actions { margin:32px 0 0; padding-top:24px; border-top:1px solid var(--line); }
      .actions a { display:inline-block; padding:12px 20px; background:var(--accent); color:#0b0b0c;
        font-weight:600; text-decoration:none; border-radius:4px; }
      .note { margin:32px 0 0; color:var(--muted); font-size:12px; }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="${SITE}/">← IA•News</a>
      <p class="kicker">${escapeHtml(article.category || 'Actualité')} · ${escapeHtml(article.source || '')}</p>
      <h1>${title}</h1>
      ${original}
      <p class="meta">${publishedLabel}${article.translated ? ' · traduit automatiquement en français' : ''}</p>
      ${image ? `<figure><img src="${escapeHtml(image)}" alt="" width="1200" height="675" loading="eager" decoding="async" /></figure>` : ''}
      <p class="lede">${escapeHtml(article.description || '')}</p>
      <p class="actions"><a href="${escapeHtml(article.link)}" rel="noopener noreferrer">Lire l’article chez ${escapeHtml(article.source || 'l’éditeur')}</a></p>
      <p class="note">Synthèse automatique. Le contenu appartient à son éditeur ; l’original fait foi.</p>
    </main>
  </body>
</html>
`
}

// SEO statique injecté au build : canonical, Open Graph, données structurées
// schema.org, une page par article et sitemap complet. Rien ne dépend de
// l'exécution JavaScript pour les robots sociaux.
function seoPlugin() {
  let snapshot = null
  try {
    snapshot = JSON.parse(readFileSync(resolve('public/feed-snapshot.json'), 'utf8'))
  } catch {
    snapshot = null
  }
  const updatedAt = snapshot?.updatedAt || new Date().toISOString()
  const allArticles = Array.isArray(snapshot?.articles) ? snapshot.articles : []
  const featured = allArticles.slice(0, 10)

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'IA•News',
        url: `${SITE}/`,
        logo: `${SITE}/images/apple-touch-icon.png`,
        description: "Veille mondiale de l'intelligence artificielle, filtrée et traduite en français.",
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: `${SITE}/`,
        name: 'IA•News',
        inLanguage: 'fr-FR',
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE}/#webpage`,
        url: `${SITE}/`,
        name: "IA•News — l'actualité mondiale de l'IA, en français",
        isPartOf: { '@id': `${SITE}/#website` },
        inLanguage: 'fr-FR',
        dateModified: updatedAt,
      },
      {
        '@type': 'ItemList',
        name: 'À la une',
        numberOfItems: featured.length,
        itemListElement: featured.map((article, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE}/article/${article.id}/`,
          name: article.title,
        })),
      },
    ],
  }

  const jsonLd = JSON.stringify(graph).replace(/</g, '\\u003c')

  return {
    name: 'ia-news-seo',
    transformIndexHtml(html) {
      const tags = `
    <link rel="canonical" href="${SITE}/" />
    <meta property="og:url" content="${SITE}/" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
    <script type="application/ld+json">${jsonLd}</script>`
      return html.replace('</head>', `${tags}\n  </head>`)
    },
    generateBundle() {
      for (const article of allArticles) {
        if (!article.id) continue
        this.emitFile({
          type: 'asset',
          fileName: `article/${article.id}/index.html`,
          source: renderArticlePage(article),
        })
      }

      const urls = [`  <url>
    <loc>${SITE}/</loc>
    <lastmod>${updatedAt}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`]
      for (const article of allArticles) {
        if (!article.id) continue
        urls.push(`  <url>
    <loc>${SITE}/article/${article.id}/</loc>
    <lastmod>${article.date || updatedAt}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`)
      }

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
      const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), seoPlugin()],
  base: '/',
})
