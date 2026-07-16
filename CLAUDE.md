<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

### SECURITY GUIDELINE
When adding or modifying any backend endpoints in the convex/ directory, ALWAYS use authenticatedQuery, authenticatedMutation, and authenticatedAction from convex/customFunctions.ts instead of the default query, mutation, or action from ./_generated/server to ensure the endpoint is secured behind authentication.

### DATABASE I/O — conventions (plan gratuit Convex, budget serré)
Le Database I/O (lectures + écritures facturées) est une contrainte forte. Deux
règles pour toute nouvelle fonction qui synchronise / importe / upserte des données :

1. **Upserts idempotents.** Avant `ctx.db.patch(...)`, comparer avec
   `champsModifies(existant, doc, [champsVolatils])` de `convex/dbUtils.ts` et NE
   PAS écrire si seuls des tampons de date (`synced_at`, `imported_at`,
   `last_scrap_at`…) changeraient. Un write inutile coûte DOUBLE : il facture
   l'écriture ET invalide toutes les `useQuery` abonnées à la table (re-lecture
   complète temps réel). Ignorer les tampons volatils dans la comparaison.

2. **Synchro externe = on-demand throttlé, PAS de cron horaire.** Pour rafraîchir
   des données externes (scrap site club, HelloAsso, imports), suivre le pattern
   de `convex/abo/sync.ts` : déclenchement au chargement de la page concernée +
   verrou anti-rejeu PARTAGÉ côté serveur (marqueur horodaté dans
   `abo_app_config`, TTL ~1 h, `reserverSync` en check-and-set atomique).
   Respecter l'ordre des dépendances (ex. HelloAsso avant le matching des
   personnes). N'ajouter un cron dans `convex/crons.ts` QUE si la donnée doit
   rester fraîche sans présence utilisateur (ex. compteur public), et alors à
   cadence lâche + justifiée par un commentaire `// CRON-OK: <raison>` au-dessus
   du job (le hook `check-cron-justification.mjs` bloque un cron non justifié).
   `SYNC_TTL_MINUTES` (env) règle la fenêtre du verrou.
