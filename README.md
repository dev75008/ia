# IA•News

Site de veille sur l'intelligence artificielle : agrégation de sources mondiales,
traduction automatique vers le français, publication statique sur GitHub Pages
(https://actuia.duckdns.org).

## Comment ça marche

```
data/sources.json ──▶ scripts/fetch-feeds.mjs ──▶ scripts/feed-parse.mjs
                             │
                             ├─ filtre de pertinence (sources généralistes)
                             ├─ déduplication par URL canonique
                             ├─ scripts/translate.mjs ──▶ data/translations.json (cache)
                             └─▶ public/feed-snapshot.json ──▶ src/App.jsx (React)
                                                                     │
                                                              vite build ──▶ GitHub Pages
```

Le workflow `.github/workflows/deploy.yml` relance l'édition toutes les quinze minutes
(`cron 7,22,37,52`), reconstruit le site et le publie. Le navigateur ne contacte jamais
les éditeurs : il lit uniquement `feed-snapshot.json`, servi depuis la même origine.

## Édition

Chaque exécution retient les **280 articles les plus récents** toutes sources confondues,
puis les traduit dans cet ordre, du plus récent au plus ancien. Le budget est de 900
requêtes par exécution : au-delà, l'article reste dans sa langue d'origine
(`translated: false`), et le cache évite de retraduire ce qui l'a déjà été.

La page répartit l'édition sans répéter deux fois le même article : une tête d'édition
(« à la une »), un récit principal, six cartes de sélection, puis le fil — paginé par
paliers de 36.

Les vignettes manquantes sont complétées à l'édition en lisant l'`og:image` de la page
d'article, avec un cache (`data/images.json`, non versionné) et un budget de 280 pages par
exécution. Les rares articles sans image gardent un visuel typographique de secours.

## Sources

`data/sources.json` est la source de vérité unique (50 flux : nom, flux, langue, pays,
portée, niveau), dont six sources chinoises (QbitAI, 雷锋网, 极客公园, 钛媒体, 爱范儿,
InfoQ 中文) pour couvrir l'un des pôles IA les plus actifs. Portée `ai` : le flux est déjà
spécialisé IA, aucun filtre. Portée `tech` : les articles sont filtrés par mots-clés avant
publication — les motifs couvrent le français, l'anglais et le chinois (人工智能, 大模型,
芯片, 机器人, 智能体…).

Pour ajouter une source : ajouter une entrée, vérifier qu'elle répond, lancer
`npm run feeds` en local. Une source en erreur reste affichée dans la section Sources du
site avec son état — elle n'est jamais masquée.

## Traduction

Les articles dont la langue d'origine n'est pas le français sont traduits **avant
publication** (`translate.mjs`) : titre et résumé, avec le titre original conservé dans le
snapshot. Chaque carte traduite porte le marqueur « traduit », et le fil peut être filtré
sur les traductions.

- Moteur principal : endpoint public `translate.googleapis.com` (`client=gtx`).
- Repli : `api.mymemory.translated.net`.
- Cache persistant (`data/translations.json`, restauré par `actions/cache` en CI) : un
  texte déjà traduit n'est jamais redemandé.
- Budget de 900 requêtes par exécution (titre et résumé), délai de 12 s par requête,
  dégradation silencieuse : un article non traduit est publié tel quel, `translated: false`.

## Lecture immersive

Un clic simple sur un article traduit ouvre un **lecteur intégré** : le corps de l'article
est extrait à la demande (Jina Reader), traduit vers le français (Google Traduction), puis
affiché dans le site. Le titre et le résumé viennent du snapshot ; le texte est mémorisé
pour la session, jamais stocké ni republié.

- `Ctrl`/`Cmd`-clic et clic milieu continuent d'ouvrir directement l'éditeur.
- En cas d'échec d'extraction, le lecteur propose la page traduite par Google ou
  l'original.
- Rien n'est hébergé : seul le texte transite au moment du clic, l'original fait foi.

## Développement

```powershell
npm install
npm run feeds     # régénère public/feed-snapshot.json
npm run dev       # serveur Vite
npm run build     # build de production dans dist/
npm run build:local # même build, sans rechargement du fichier de config (environnements confinés)
```

## Structure

| Chemin | Rôle |
| --- | --- |
| `data/sources.json` | Liste des 50 sources validées |
| `data/translations.json` | Cache de traduction (non versionné) |
| `data/images.json` | Cache des vignettes `og:image` (non versionné) |
| `scripts/fetch-feeds.mjs` | Édition : collecte, filtre, vignettes, traduction, snapshot |
| `scripts/feed-parse.mjs` | Analyse RSS/Atom tolérante, sans dépendance |
| `scripts/translate.mjs` | Traduction FR avec cache et repli |
| `scripts/build.mjs` | Build local (contourne le chargement de config du CLI) |
| `scripts/parse-smoke.mjs` | Vérification manuelle du parseur sur quatre flux |
| `src/App.jsx` | Composition de l'interface (React 19) |
| `src/components/` | En-tête, hero, radar, une, fil, sources, lecteur |
| `src/hooks/` | Snapshot, thème, filtres, révélation au défilement |
| `src/lib/format.js` | Dates relatives, langues, durées de lecture |
| `src/reader.js` | Lecture immersive : extraction et traduction à la demande |
| `src/styles.css` | Système de design (jetons, composants, mouvement) |
| `public/images/` | Logo, favicon et image de partage |
| `docs/charte-graphique.md` | Charte graphique v2 |

## Performance

Interface React 19 sans bibliothèque d'animation : entrées, révélations au défilement et
compteurs reposent sur CSS, `IntersectionObserver` et `requestAnimationFrame`. Le lecteur
de traduction est chargé à la demande (chunk séparé), la recherche est différée
(`useDeferredValue`) et les filtres passent par `startTransition`.

- Bundle initial : ~250 Ko (78 Ko gzip) + 6 Ko pour le lecteur, contre 366 Ko (123 Ko gzip)
  avec GSAP.
- Plus de re-rendu global périodique : l'horloge n'est plus un état rafraîchi toutes les 30 s.
- Image du hero en `fetchpriority="high"`, cartes en `loading="lazy"` et `decoding="async"`.

## Limites connues

- La traduction passe par un endpoint public non contractuel : en cas de blocage, les
  articles restent en version originale et signalés.
- La lecture immersive dépend de Jina Reader et de Google Traduction au moment du clic :
  si l'un des deux est indisponible, le lecteur propose la page traduite ou l'original.
- Le snapshot est mis à jour toutes les quinze minutes ; ce n'est pas du temps réel
  seconde par seconde.
- Les images proviennent des flux ou de l'`og:image` de l'article ; les rares articles sans
  image affichent un glyphe typographique.
- Plusieurs rédactions couvrent souvent le même sujet : les articles ne sont pas regroupés
  en un récit unique, la déduplication se fait sur l'URL exacte.
