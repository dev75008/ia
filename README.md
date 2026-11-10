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

Chaque exécution retient les **240 articles les plus récents** toutes sources confondues,
puis les traduit dans cet ordre, du plus récent au plus ancien. Le budget est de 900
requêtes par exécution : au-delà, l'article reste dans sa langue d'origine
(`translated: false`), et le cache évite de retraduire ce qui l'a déjà été.

La page répartit l'édition sans répéter deux fois le même article : une tête d'édition
(« à la une »), un récit principal, six cartes de sélection, puis le fil — paginé par
paliers de 36.

## Sources

`data/sources.json` est la source de vérité unique (45 flux : nom, flux, langue, pays,
portée, niveau). Portée `ai` : le flux est déjà spécialisé IA, aucun filtre. Portée `tech` :
les articles sont filtrés par mots-clés avant publication.

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
| `data/sources.json` | Liste des 45 sources validées |
| `data/translations.json` | Cache de traduction (non versionné) |
| `scripts/fetch-feeds.mjs` | Édition : collecte, filtre, traduction, snapshot |
| `scripts/feed-parse.mjs` | Analyse RSS/Atom tolérante, sans dépendance |
| `scripts/translate.mjs` | Traduction FR avec cache et repli |
| `scripts/build.mjs` | Build local (contourne le chargement de config du CLI) |
| `scripts/parse-smoke.mjs` | Vérification manuelle du parseur sur quatre flux |
| `src/App.jsx` | Interface (React, GSAP) |
| `src/styles.css` | Système de design (jetons, composants, mouvement) |
| `docs/charte-graphique.md` | Charte graphique v2 |

## Limites connues

- La traduction passe par un endpoint public non contractuel : en cas de blocage, les
  articles restent en version originale et signalés.
- Le snapshot est mis à jour toutes les quinze minutes ; ce n'est pas du temps réel
  seconde par seconde.
- Les images proviennent des flux ; certaines sources n'en publient pas, la carte affiche
  alors un glyphe typographique.
- Plusieurs rédactions couvrent souvent le même sujet : les articles ne sont pas regroupés
  en un récit unique, la déduplication se fait sur l'URL exacte.
