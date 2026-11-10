# IA•News — charte graphique et système de design

Version 2 · novembre 2026. Remplace la direction « Bauen » (2025).

## Intention

Un **desk éditorial**, pas une landing page : la sensation d'un poste de veille où l'on
surveille le monde entier. L'information domine, le décor s'efface. Trois principes :

1. **Densité lisible** — beaucoup d'information, jamais de bruit. Hiérarchie par le corps
   typographique et le contraste, pas par les cadres.
2. **Mouvement utile** — le mouvement signale la fraîcheur (révélation, compteurs, ticker),
   il ne décore pas. Aucune animation n'empêche de lire.
3. **Franc-parler** — ce qui est traduit est signalé, ce qui vient d'une source est nommé,
   ce qui est indisponible est affiché. La transparence fait partie du design.

## Palette

Le thème sombre est la référence ; le thème clair est une déclinaison explicite
(`:root[data-theme="light"]`).

| Rôle | Sombre | Clair |
| --- | --- | --- |
| Fond | `#0B0B0C` | `#F3EFE7` |
| Surface (cartes) | `#131315` | `#FBF8F2` |
| Surface haute (barres, survol) | `#191A1D` | `#FFFFFF` |
| Filets | `#26262B` | `#DCD3C3` |
| Texte | `#F4F1EA` | `#14130F` |
| Texte secondaire | `#96948E` | `#6B675F` |
| Accent (signal) | `#C8F751` | `#5C7A00` |
| Encre sur accent | `#0B0B0C` | `#F7F4EC` |
| Marqueur « traduit » | `#FF7A50` | `#C2410C` |

Règles : l'accent vert acide ne porte jamais de petit texte sur fond sombre — il sert d'aplat, de filet, de chiffre ou d'état actif. Le corail est réservé aux articles traduits et
aux sources en erreur : une seule signification par couleur.

## Typographie

| Usage | Fonte | Réglages |
| --- | --- | --- |
| Titres, étiquettes, chiffres | Oswald (local) | 300–500, capitales, interlettrage `-0.015em`, interligne 0.92 sur le hero |
| Texte courant | Didact Gothic (local) | 15–17 px, interligne 1.65 |
| Accents éditoriaux | Instrument Serif italique (local) | chapô, citations, sur-titres |

Les trois fontes sont servies depuis `public/fonts` avec leurs licences SIL OFL.
Aucun appel à Google Fonts à l'exécution. L'interlettrage large (`0.14em`) est réservé aux
micro-étiquettes en capitales ; jamais sur les grands titres.

## Grille et rythme

- Largeur de contenu : `1320px` maximum, gouttières `32px` (desktop), `20px` (tablette), `16px` (mobile).
- Points de rupture : `1100px`, `960px`, `860px`, `700px`, `560px`.
- Rythme vertical : multiples de 4 px ; sections espacées de 72–96 px.
- Barre de nav collante avec flou, filet 1 px ; bandeau « direct » de 34 px au-dessus.

## Composants

1. **Bandeau direct** — pastille d'état, date, heure de dernière édition, rappel de la recherche (`/`).
2. **Masthead** — marque, navigation, recherche, thème, menu mobile. Collant, z-index au-dessus du contenu.
3. **Hero** — deux colonnes : titre masqué animé ligne par ligne, chapô, actions, quatre compteurs ; carte « à la une » à droite, corps en dégradé.
4. **Ticker** — noms des sources en défilement continu, pause au survol.
5. **Radar** — cartes de catégories cliquables avec index, compteur et flèche.
6. **Une** — récit principal horizontal (média 58 % / texte 42 %), ou bandeau pleine largeur
   lorsque l'article n'a pas d'image, puis grille de six cartes.
7. **Fil** — filtres collants (catégories, source, langue d'origine, tri), grille de cartes
   paginée par paliers de 36.
8. **Sources** — liste compacte avec pastille d'état, langue et nombre d'articles.
9. **Pied de page** — marque, mention de traduction, compteurs d'édition.
10. **Lecteur FR** — voile modal, titre traduit, chapô et corps traduit à la demande,
    outils « original » et fermeture ; repli vers la page Google Traduction.

## Mouvement

| Moment | Geste | Durée |
| --- | --- | --- |
| Entrée | Lignes du titre révélées par masque (`yPercent`), puis chapô et carte | 0.5–0.9 s, `power3.out` |
| Défilement | Sections en fondu + translation 34 px, une seule fois | 0.75 s |
| Filtres | Cartes en cascade 28 ms | 0.5 s |
| Survol | Carte −2 px, image ×1.03, flèche +2 px | 180–240 ms |
| Ticker | Boucle linéaire, pause au survol | continu |

`prefers-reduced-motion: reduce` neutralise animations, transitions et défilement doux ;
les compteurs affichent leur valeur finale et le ticker se fige.

Les animations sont en CSS, `IntersectionObserver` et `requestAnimationFrame` : aucun
moteur d'animation externe n'est chargé.

## Accessibilité

- Contraste minimum : 7:1 pour le texte courant, 4.5:1 pour les étiquettes.
- Focus visible : anneau accent 2 px, décalage 4 px, jamais supprimé.
- Lien d'évitement, libellés de formulaire masqués mais présents, `aria-pressed` sur les filtres,
  `aria-live` sur l'état du fil, `aria-expanded` sur le menu.
- Aucune information portée par la couleur seule : chaque état a un texte.
- Cible tactile ≥ 40 px, `overflow-wrap: anywhere` sur les titres longs (mots français).

## Contenus et sources

- Chaque flux est interrogé directement chez l'éditeur, avec un agent identifiant et un délai de 18 s.
- Les articles non francophones sont traduits automatiquement **avant publication** ; le titre
  original reste stocké (`originalTitle`) et la carte porte le marqueur « traduit ».
- Une source en erreur reste visible dans la section Sources avec son état — jamais masquée.
- Les images sont chargées à la demande, sans référent, et remplacées par un glyphe typographique
  lorsqu'elles manquent ou échouent. Les vignettes absentes des flux sont complétées par
  l'`og:image` de la page d'article.
