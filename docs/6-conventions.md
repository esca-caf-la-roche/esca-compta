# Conventions de développement

Ces règles complètent les configurations TypeScript et ESLint. Pour la
localisation des domaines, voir [8-component-mapping.md](8-component-mapping.md).

## TypeScript et organisation

- Utiliser TypeScript pour tout nouveau code frontend et Convex.
- Conserver les composants React en `PascalCase` et les hooks ou fonctions en
  `camelCase`.
- Placer une page routée dans `src/pages/`, un composant partagé dans
  `src/components/` et les utilitaires purs dans `src/utils/`.
- Regrouper le code propre aux Abonnements sous `src/abonnements/` et
  `convex/abo/`.
- Utiliser `import type` lorsque l'import ne sert qu'au typage.
- Éviter `any` ; utiliser notamment `Doc<"table">`, `Id<"table">` et les types
  de contexte générés par Convex.

La configuration TypeScript refuse les variables et paramètres inutilisés ainsi
que les chutes implicites dans les `switch`.

## Endpoints Convex

Tout nouvel endpoint applicatif doit être authentifié :

```ts
// GOOD
import { authenticatedMutation } from "./customFunctions";

export const enregistrer = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    // L'identité a déjà été vérifiée par le wrapper.
    return null;
  },
});
```

```ts
// BAD
import { mutation } from "./_generated/server";

export const enregistrer = mutation({
  args: {},
  handler: async () => null,
});
```

Utiliser `authenticatedQuery`, `authenticatedMutation` et
`authenticatedAction` depuis `convex/customFunctions.ts`. Ajouter ensuite
`requireTile`, `requireAdmin`, `requireAboIdentity` ou `requireAboAdmin` selon le
domaine.

Une surface volontairement publique doit importer le registrar Convex brut et
porter `// PUBLIC: <justification>` immédiatement au-dessus de son export. Les
fonctions exclusivement appelées par le backend utilisent les registrars
`internalQuery`, `internalMutation` ou `internalAction`.

Tous les arguments et retours exposés doivent avoir leurs validateurs Convex.
Lire `convex/_generated/ai/guidelines.md` avant toute modification du backend.

## Contrôle d'accès

L'accès à une tuile dépend exclusivement de
`userSettings.allowedTiles`. Le rôle `admin` autorise la page Configurations,
mais ne donne aucun passe-droit sur les modules.

Une nouvelle tuile nécessite les trois niveaux suivants :

```text
Dashboard : visibilité
  -> RequireAccess : protection de la route
    -> helper Convex : autorisation sur les données
```

Ne jamais accepter un identifiant utilisateur fourni par le client pour prendre
une décision d'autorisation. L'identité doit être dérivée côté serveur.

## Contrat de saison

Une donnée métier saisonnière doit :

1. porter un champ `saison` ;
2. déclarer l'index `.index("by_saison", ["saison"])` ;
3. être filtrée par cet index ;
4. définir sa politique de suppression dans `convex/saisons.ts`.

Une exception porte `// SAISON-EXEMPT: <raison>`. Les nouvelles tuiles doivent
aussi réagir au changement de saison sans mélanger les données de deux saisons.

## Database I/O

Le projet fonctionne avec un budget Convex contraint.

- Borner ou paginer les collections ; éviter les lectures intégrales non
  nécessaires.
- Utiliser un index au lieu d'un filtre en mémoire.
- Avant un upsert, comparer avec `champsModifies` depuis `convex/dbUtils.ts` et
  ne pas écrire si seules des dates techniques changent.
- Préférer une synchronisation externe à la demande avec verrou serveur partagé
  au cron périodique.
- N'ajouter un cron que pour une fraîcheur indépendante de tout utilisateur,
  avec une cadence mesurée et `// CRON-OK: <raison>`.
- Mesurer les deux déploiements avec `npm run audit:convex-io` : le tableau
  d'équipe additionne DEV, previews, PROD et les autres projets. Un pic global
  ne prouve donc pas une hausse du trafic public.
- Utiliser `convex dev --local` pour les serveurs lancés par un agent. Pour une
  validation non interactive, utiliser `npm run check:convex` ; ne pas pousser
  le code vers le DEV cloud avec `convex dev --once` comme simple typecheck.
- Une query React ne reçoit pas de `Date.now()` recalculé à chaque rendu. Passer
  un argument stable et grossier uniquement si le temps fait partie du résultat.
- Justifier un nouveau parcours complet par `// IO-BOUNDED: <raison et volume
  maximal>`. Une petite table peut rester scannée si le gain d'un index ou d'une
  migration serait inférieur à leur complexité, mais la borne doit être explicite.

## Erreurs

Utiliser un message destiné à l'utilisateur pour les erreurs métier. Lorsque le
client doit distinguer plusieurs cas, préférer `ConvexError` avec une charge
utile structurée. Ne jamais inclure de secret, cookie, donnée personnelle ou
réponse externe brute dans les logs.

## Styles

Réutiliser les variables et motifs de `src/index.css`. Les styles strictement
propres au parcours Abonnements restent dans `src/abonnements/abo.css`.

```css
/* GOOD : identité existante */
.action {
  border: 3px solid var(--foreground);
  box-shadow: 4px 4px 0 var(--foreground);
}
```

Éviter l'ajout d'une bibliothèque de composants pour un besoin ponctuel. Les
interactions doivent rester utilisables au clavier et sur mobile.
