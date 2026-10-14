# IA•News — Direction Bauen

Référence : [Bauen, Architecture & Interior Template de DuruThemes](https://preview.themeforest.net/item/bauen-architecture-interior-template/full_screen_preview/30110777), variante sombre. L’interface React est une adaptation originale : les fichiers commerciaux, logos et photographies du template ne sont pas intégrés.

## Palette

| Usage | Sombre, par défaut | Clair |
| --- | --- | --- |
| Fond | `#272727` | `#f8f5f0` |
| Cartes | `#303030` | `#eee9e2` |
| Texte | `#ffffff` | `#35312d` |
| Texte secondaire | `#b4b4b4` | `#68615a` |
| Accent sable | `#b19777` | `#816443` |
| Rail, logo et pied de page | `#202020` | Identique |

## Typographie

Oswald pour les titres, le logo et les libellés ; Didact Gothic pour la lecture. Polices stockées localement dans `public/fonts` avec leurs licences SIL Open Font License. Titres légers en capitales espacées ; grand titre de 34 à 65 px, titres de section de 29 à 40 px. Texte courant de 15 à 17 px. Aucun appel à Google Fonts à l’exécution.

## Composition

Grande photographie architecturale avec voile sombre, texte aligné à droite. Logo dans un bloc carré anthracite et rail vertical discret sur ordinateur. Sections de présentation et de sélection, cartes visuelles rectangulaires et fil en trois, deux ou une colonne. Accent sable réservé aux repères, catégories et liens. Menu repliable et sélection horizontale sur mobile.

## Visuel et sources

Photographie stockée localement dans `public/images/architecture.jpg` : [image Unsplash](https://images.unsplash.com/photo-1600585154340-be6161a56a0c), utilisée sous la [licence Unsplash](https://unsplash.com/license). Elle est décorative et ne représente pas un article. L’ancienne illustration Monolit est retirée.

Oswald et Didact Gothic proviennent du dépôt officiel [Google Fonts](https://github.com/google/fonts), dossiers `ofl/oswald` et `ofl/didactgothic`. Licences conservées aux côtés des fichiers.

## UX et mouvement

Recherche, catégories, sources, tri et actualisation conservés. Thème sombre par défaut ; une préférence de thème déjà choisie reste respectée. Menu mobile annoncé avec `aria-expanded`, focus clavier visible, titre principal unique et liens descriptifs.

Animations GSAP d’entrée et zoom léger des images au survol. Réduction des mouvements prise en charge en CSS et JavaScript. Pas de défilement automatique ni de vidéo décorative. Aucun lien GitHub dans le pied de page.
