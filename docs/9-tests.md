# Guide de tests et de validation

## État actuel

Le dépôt ne contient actuellement :

- ni fichier `*.test.*` ou `*.spec.*` ;
- ni configuration Vitest, Jest ou Playwright ;
- ni commande `npm test` ;
- ni contrôle automatisé autre que TypeScript, ESLint et le build.

Il ne faut donc pas présenter le projet comme couvert par des tests
automatisés. La checklist du module Abonnements dans
[5-module-abonnements.md](5-module-abonnements.md) est une validation manuelle,
pas une suite exécutable.

## Contrôles disponibles

```bash
npm run lint
npm run build
```

`npm run build` exécute `tsc -b` puis `vite build`. Ces commandes détectent des
problèmes statiques et de compilation, mais pas les régressions métier.

## Validation manuelle minimale

Pour tout changement fonctionnel :

1. tester le parcours nominal ;
2. provoquer au moins une erreur de validation ;
3. vérifier un utilisateur autorisé et un utilisateur refusé ;
4. changer de saison lorsque la fonctionnalité est saisonnière ;
5. recharger la page pour vérifier la persistance et les données temps réel ;
6. contrôler les affichages mobile et clavier pour une modification frontend ;
7. vérifier qu'une synchronisation externe répétée respecte son verrou.

Pour le module Abonnements, utiliser la checklist e2e de
[5-module-abonnements.md](5-module-abonnements.md).

## Stratégie recommandée

Introduire les tests progressivement autour des règles métier les plus risquées,
sans bloquer leur adoption sur une couverture globale.

### Priorité 1 : fonctions pures

Commencer par les utilitaires sans dépendance réseau :

- `src/utils/paieCompute.ts` ;
- `src/utils/planning.ts` ;
- `src/abonnements/lib/tests.ts` ;
- normalisation et matching dans `convex/abo/lib.ts`.

Cas attendus : valeurs limites, arrondis, entrées vides, changements de saison
et doublons.

### Priorité 2 : fonctions Convex

Utiliser `convex-test` avec Vitest et l'environnement `edge-runtime`. Placer les
tests Convex près du backend, avec le schéma et le module map requis par Convex.

Les premiers scénarios devraient couvrir :

- refus d'un endpoint sans identité ;
- absence de passe-droit admin sur une tuile ;
- isolation entre staff et abonnés publics ;
- propriété d'un dossier et d'un fil de discussion ;
- idempotence des synchronisations et upserts ;
- suppression ou conservation des données lors d'un changement de saison.

### Priorité 3 : parcours navigateur

Ajouter ensuite quelques scénarios e2e ciblés :

- connexion OTP avec transport email simulé ;
- navigation selon les tuiles autorisées ;
- création puis consultation d'une transaction ;
- demande Abonnements, validation admin et suivi public.

Les appels SMTP, HelloAsso, Google Drive et site du club doivent être simulés.
Les tests automatisés ne doivent jamais dépendre des secrets ou des données de
production.

## Critère de fin

Une fonctionnalité est prête lorsque lint et build passent, que ses scénarios
manuels à risque ont été exécutés et que la documentation reflète les limites
réelles. Dès qu'une suite automatisée sera ajoutée, sa commande et son périmètre
devront être reportés dans ce document et dans le README.
