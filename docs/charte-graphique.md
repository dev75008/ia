# IA•News — Direction Monolit

Référence visuelle : [Monolit, template d’architecture de KWST](https://preview.themeforest.net/item/monolit-responsive-architecture-template/full_screen_preview/14957568). Adaptation originale en React : aucun code, photographie ou logo du template commercial n’est intégré.

## Identité

Une composition architecturale : grande entrée visuelle, navigation anthracite, rail vertical sur ordinateur, titres espacés, traits fins et sections numérotées. Le nom IA•News et le contenu éditorial restent au centre du site.

## Palette

| Usage | Clair | Sombre |
| --- | --- | --- |
| Fond éditorial | `#ffffff` | `#171717` |
| Surface secondaire | `#f6f6f6` | `#222222` |
| Texte | `#242424` | `#f5f5f5` |
| Texte secondaire | `#646464` | `#b3b3b3` |
| Séparateurs | `#dddddd` | `#414141` |
| Navigation et pied de page | `#1b1b1b` | Identique |
| Accent du logo | `#b5a38c` | Identique |

## Typographie et mise en page

Arial, Helvetica et sans-serif système : aucune police distante requise. Grand titre de 40 à 120 px, capitales espacées. Sous-titres de 10 à 12 px avec un espacement de 2 à 5 px. Titres éditoriaux légers de 29 à 38 px ; titres d’articles de 21 à 22 px.

Largeur maximale : 1200 px. Rail latéral : 72 px sur ordinateur. Navigation : 86 px, réduite à 74 px sur mobile. Éléments rectangulaires, bordures fines, cartes sans ombres ni arrondis. Articles en trois, deux ou une colonne suivant la largeur. Sélection horizontale sur mobile.

## Visuel

`public/images/architecture.svg` est une illustration architecturale originale, locale, utilisée comme décor. Le voile sombre assure la lisibilité des textes. Les photos d’articles passent d’une saturation discrète à leur couleur d’origine au survol.

## UX et mouvement

La recherche, les catégories, les sources, le tri et l’actualisation sont conservés. Menu mobile avec état ouvert/fermé annoncé aux technologies d’assistance. Focus clavier visible. Thèmes clair/sombre et préférence locale conservés.

Entrées progressives GSAP et léger zoom des photos au survol. Les animations se désactivent avec `prefers-reduced-motion`. Aucun carrousel automatique ni vidéo décorative. Le lien GitHub reste absent du pied de page.
