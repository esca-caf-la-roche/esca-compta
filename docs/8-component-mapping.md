# Cartographie des composants

Cette cartographie indique où commencer une modification. Elle ne duplique pas
le détail métier de chaque module.

## Socle

| Responsabilité | Frontend | Backend |
|---|---|---|
| Initialisation | `src/main.tsx` | `convex/convex.config.ts` |
| Routage | `src/App.tsx` | — |
| Mise en page staff | `src/components/Layout.tsx` | — |
| Autorisation par tuile | `src/components/RequireAccess.tsx` | `convex/access.ts` |
| Saison courante | `src/contexts/SeasonContext.tsx` | `convex/saisons.ts`, `convex/saisonUtils.ts` |
| Utilisateurs et tuiles | `src/pages/Configurations.tsx` | `convex/users.ts` |
| Authentification | `src/pages/Login.tsx` | `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts` |
| Schéma | — | `convex/schema.ts` |
| Wrappers sécurisés | — | `convex/customFunctions.ts` |

## Modules staff

| Module et routes | Pages principales | Backend |
|---|---|---|
| Tableau de bord `/` | `src/pages/Dashboard.tsx` | `convex/users.ts` |
| Comptabilité `/compta` | `src/pages/Compta.tsx` | `convex/transactions.ts`, `convex/tiers.ts`, `convex/analytiques.ts`, `convex/typesDocuments.ts` |
| Paiements `/paiements/*` | `src/pages/Paiements/` | `convex/paiements.ts`, `convex/helloasso.ts`, `convex/drive.ts` |
| Budget `/budget/*` | `src/pages/Budget/` | `convex/paie.ts`, `convex/cours.ts`, `convex/previsionnels.ts`, `convex/effectifs.ts` |
| Licences `/licences-cours` | `src/pages/LicencesEnCours.tsx` | `convex/abo/licencesEnCours.ts`, `convex/abo/licences.ts`, `convex/abo/sync.ts` |
| Administration `/configurations` | `src/pages/Configurations.tsx` | `convex/users.ts`, `convex/saisons.ts`, `convex/bootstrap.ts` |

Les routes `/adherents`, `/evenements` et `/statistiques` sont actuellement des
placeholders déclarés dans `src/App.tsx`, sans module métier associé.

## Module Abonnements

La documentation fonctionnelle complète est dans
[5-module-abonnements.md](5-module-abonnements.md).

| Parcours | Frontend | Backend |
|---|---|---|
| Connexion publique | `src/abonnements/AboLogin.tsx` | `convex/auth.ts`, `convex/abo/identity.ts` |
| Demande et suivi | `src/abonnements/pages/` | `convex/abo/demandes.ts`, `convex/abo/config.ts` |
| Messagerie | `src/abonnements/FilDiscussion.tsx` | `convex/abo/messages.ts`, `convex/abo/emails.ts` |
| Administration | `src/abonnements/admin/` | `convex/abo/` |
| Paiements | `src/abonnements/admin/Paiements.tsx` | `convex/abo/paiements.ts`, `convex/helloasso.ts` |
| Licences | `src/abonnements/admin/Licences.tsx` | `convex/abo/licences.ts`, `convex/abo/matching.ts` |
| Tests d'autonomie | `src/abonnements/admin/Tests.tsx` | `convex/abo/tests.ts` |
| Compteur public | `src/abonnements/Compteur.tsx` | `convex/abo/compteur.ts` |
| Synchronisations | chargement des pages concernées | `convex/abo/sync.ts`, `convex/abo/scrap.ts` |

## Composants et utilitaires partagés

| Élément | Emplacement | Usage |
|---|---|---|
| Tuiles | `src/components/Tile.tsx` | Navigation du tableau de bord |
| Formulaire de transaction | `src/components/TransactionFormModal.tsx` | Comptabilité |
| Formulaire prévisionnel | `src/components/PrevisionnelFormModal.tsx` | Budget prévisionnel |
| Composants Budget | `src/components/Budget/` | Cours, salariés et paramètres |
| Calcul de paie | `src/utils/paieCompute.ts` | Calculs purs du budget |
| Planning | `src/utils/planning.ts` | Manipulation des séances |
| Couleurs | `src/utils/colors.ts` | Présentation cohérente |
| Diff d'upsert | `convex/dbUtils.ts` | Évite les écritures Convex inutiles |

## Intégrations externes

| Service | Point d'intégration |
|---|---|
| Email staff | `convex/email.ts` |
| Email Abonnements | `convex/abo/emails.ts` |
| HelloAsso | `convex/helloasso.ts`, `convex/abo/paiements.ts` |
| Google Drive | `convex/drive.ts` |
| Site du club | `convex/abo/scrap.ts` |
| Annuaire des licences | `convex/abo/licences.ts` |

Les secrets associés résident dans les variables d'environnement Convex. Le
frontend ne reçoit que `VITE_CONVEX_URL`.
