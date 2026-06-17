# Design System Néo-Brutaliste

Afin de donner une identité forte au club d'escalade, le site adopte le style "Néo-Brutalisme". 

Le Néo-Brutalisme se caractérise par :
- Des contrastes très marqués.
- Des couleurs "crues" et vives (Rouge `#ff5e5e`, Jaune `#ffea00`, Cyan `#00e5ff`, etc.).
- Des bordures noires épaisses (`3px solid #000`).
- Des ombres portées "dures" (sans flou), généralement décalées en bas à droite (ex: `6px 6px 0px 0px #000`).
- Une typographie grasse et imposante (l'utilisation de la police `Space Grotesk` et des textes en majuscules).

## Règles CSS Principales

Toutes les variables sont déclarées au sommet du fichier `src/index.css`.

### Couleurs
- `--background`: Le fond principal (couleur crème `#fdf6e3`).
- `--card`: Le fond des éléments de contenu (blanc `#ffffff`).
- `--foreground`: Le texte (noir `#000000`).
- Les couleurs d'action : `--primary`, `--success`, `--warning`, `--danger`, `--info`.

### Formes
Contrairement au web design moderne "premium" (Glassmorphism, bords arrondis, ombres douces), ici la variable `--radius` est à `0px` pour forcer des angles droits.

### Animations
L'interactivité est signifiée non pas par un changement de couleur subtil, mais par un **déplacement physique** de l'élément (translation) couplé à une **réduction de son ombre**, donnant l'illusion d'un bouton mécanique qu'on enfonce.

```css
.btn-primary:hover {
  transform: translate(4px, 4px);
  box-shadow: 2px 2px 0px 0px #000;
}
```

## Implémentation

La totalité de ce design a été développée en Vanilla CSS, évitant la surcharge de librairies lourdes (comme Material UI ou Tailwind), permettant une maintenance facile et des performances optimales.
