import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SITE = 'https://actuia.duckdns.org'

// SEO statique injecté au build : canonical, Open Graph, données structurées
// schema.org et sitemap. Les robots sociaux ne dépendent pas de l'exécution JS.
function seoPlugin() {
  let snapshot = null
  try {
    snapshot = JSON.parse(readFileSync(resolve('public/feed-snapshot.json'), 'utf8'))
  } catch {
    snapshot = null
  }
  const updatedAt = snapshot?.updatedAt || new Date().toISOString()
  const articles = Array.isArray(snapshot?.articles) ? snapshot.articles.slice(0, 10) : []

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
        numberOfItems: articles.length,
        itemListElement: articles.map((article, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: article.link,
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
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${updatedAt}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
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
