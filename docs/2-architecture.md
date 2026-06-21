# Architecture Technique

Ce document décrit l'architecture globale de l'application de Gestion d'Escalade.

## Stack Technologique

- **Frontend** : React 19, Vite, TypeScript
- **Routage** : `react-router-dom` (v6+)
- **Style** : Vanilla CSS (Variables natives, Flexbox/Grid) respectant une charte Néo-Brutaliste
- **Backend / BDD** : Convex (Serverless, TypeScript)
- **Icônes** : `lucide-react`

## Structure du Code Source (`src/`)

- `components/` : Composants réutilisables à travers l'application.
  - `Layout.tsx` : Le gabarit principal (Header, Sélecteur de saison) qui englobe les routes protégées.
  - `Tile.tsx` : La carte de navigation du Dashboard.
- `contexts/` : 
  - `SeasonContext.tsx` : Fournit la saison actuelle et s'occupe de la persistance dans `localStorage`.
- `pages/` : Les différentes vues de l'application (chaque page correspond à une route).
  - `Login.tsx` : La page publique de connexion.
  - `Dashboard.tsx` : L'accueil avec les tuiles après connexion.
  - `Compta.tsx` : Le mini-outil dédié à la comptabilité.
- `App.tsx` : Le point d'entrée du routage.
- `main.tsx` : L'initialisation de React et du client Convex.
- `index.css` : La totalité des règles de style du projet (Design Néo-Brutaliste).

## Structure Backend (`convex/`)

- `schema.ts` : Déclaration du schéma de base de données incluant les tables d'authentification de `@convex-dev/auth` (via `authTables`).
- `auth.ts` : Configuration officielle de `@convex-dev/auth` (signIn, signOut, callbacks de sécurité).
- `email.ts` : Action d'envoi SMTP des codes OTP via nodemailer.
- `transactions.ts` : Les fonctions CRUD pour la manipulation de la comptabilité.
