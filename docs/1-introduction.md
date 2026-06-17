# Introduction au Portail de Gestion Escalade

Le projet "esca-compta" a pivoté pour devenir un portail global de gestion pour le club d'escalade. 

L'objectif de cette application est de regrouper plusieurs "mini-outils" (Comptabilité, Adhérents, Événements, Statistiques) au sein d'une seule et même interface centralisée, hautement sécurisée, et disposant d'une charte graphique forte (Néo-Brutalisme).

## Fonctionnalités Principales

1. **Dashboard Centralisé** : Un point d'entrée unique listant tous les outils disponibles sous forme de tuiles.
2. **Saisonnabilité Transversale** : L'application permet de sélectionner une saison en cours (ex: "2025-26"). Ce choix est conservé en mémoire (via le localStorage) et propagé à tous les mini-outils pour garantir qu'un utilisateur consulte toujours les données de la bonne année.
3. **Sécurité par OTP** : Aucune création de compte publique n'est autorisée. Les membres accèdent au portail via un mot de passe à usage unique (OTP) envoyé par le système, si leur email est connu de la base de données.
4. **Base de données temps réel** : Utilisation de [Convex](https://convex.dev/) pour synchroniser instantanément les modifications sans avoir à recharger la page.

## Prérequis

- **Node.js** (v18 ou supérieur recommandé)
- **Convex CLI** (installé via npm)

## Démarrage Rapide

1. Installez les dépendances :
   ```bash
   npm install
   ```
2. Démarrez le backend Convex dans un terminal :
   ```bash
   npx convex dev
   ```
3. Démarrez l'application frontend React/Vite dans un autre terminal :
   ```bash
   npm run dev
   ```
