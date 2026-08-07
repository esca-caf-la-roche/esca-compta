# Module « Abonnements escalade »

Portage de l'outil autonome `abo-esca-new/` (Vanilla JS + Supabase) **entièrement
sur Convex**. Gère les nouvelles inscriptions aux créneaux autonomes d'escalade
(350 places) : demande multi-personnes gatée par vagues, suivi d'avancement,
espace admin (validation, compteur, anomalies, licences, tests d'autonomie),
paiements HelloAsso, scraping du site club, emails transactionnels, messagerie.

## Deux populations, une seule base

| Population | Auth | Accès | Identifiant technique |
|---|---|---|---|
| **Staff / bénévoles** | provider `google-otp` (email pré-créé par un admin) | Espace admin `/#/gestion-abonnements` (tuile du tableau de bord) **si** la tuile `abonnements` est cochée dans *Configurations > Utilisateurs* | `userSettings.allowedTiles` inclut `"abonnements"` |
| **Abonnés publics** | provider `abo-otp` (auto-inscription OTP, boîte mail dédiée) | Espace isolé `/#/abonnements` uniquement (aucune mention compta) | ligne `abo_profiles` (role `utilisateur`) ; peut coexister avec un `userSettings` pour la demande personnelle d'un staff |

🔒 **Cloisonnement** : `getAboIdentity` (`convex/abo/auth.ts`) dérive le rôle admin
**exclusivement** de `userSettings.allowedTiles` — le rôle `"admin"` compta ne
donne aucun passe-droit. Un abonné public sans `userSettings` n'a aucun accès aux
tuiles compta ; le `Layout` le redirige vers `/abonnements`. Un staff qui dépose
une demande conserve ses droits staff ; au reset, seules ses données publiques
de campagne et son profil public sont purgés.

## Variables d'environnement (dashboard Convex → *Settings > Environment Variables*)

> ⚠️ Ces variables se posent **côté Convex** (pas dans `.env.local`, qui ne sert
> qu'au front). En dev, l'absence de secrets email fait basculer l'envoi en
> **fallback console** (l'OTP / les emails s'affichent dans les logs Convex).
> Pour la prod : `npx convex env set NOM valeur --prod`.

### Spécifiques au module Abonnements

| Variable | Rôle | Obligatoire |
|---|---|---|
| `EMAIL_SENDER_ABO` | Adresse d'envoi des emails abonnés (OTP `abo-otp` + transactionnels). **Boîte distincte** de l'OTP compta. | Oui (sinon fallback console) |
| `EMAIL_PASSWORD_ABO` | Mot de passe / app-password de la boîte abo. | Oui (sinon fallback console) |
| `CLUB_BASE_URL` | URL de base du site club (scraping abonnés + export élèves en cours). | Oui pour le scraping |
| `CLUB_USERNAME` | Identifiant d'authentification AJAX au site club. | Oui pour le scraping |
| `CLUB_PASSWORD` | Mot de passe du site club. | Oui pour le scraping |
| `CLUB_ENCADRANTS` | Liste d'encadrants (override du défaut) pour l'export des cours. | Non |
| `IMPORT_SAISON` | Force la saison sportive (sinon déduite ~septembre). | Non |
| `LICENCES_USER` | Basic Auth de l'export annuaire FFCAM (`export_licence.php`). | Oui pour l'import annuaire |
| `LICENCES_PASSWORD` | Mot de passe de l'export annuaire. | Oui pour l'import annuaire |

Le **lien HelloAsso du formulaire abonnements** n'est PAS une variable
d'environnement : il se configure dans l'UI admin (*Configuration*) et est stocké
dans `abo_app_config` (clé `helloasso_lien`) + une ligne `helloasso_links`.

## Suivi des paiements Abonnements

L'onglet *Paiements* importe uniquement le formulaire HelloAsso configuré pour
les Abonnements. Son compteur de synchronisation ne couvre donc jamais les
formulaires des cours. Les commandes et transactions HelloAsso sont conservées
dans le cache partagé, mais la décision manuelle de l'équipe (`À traiter`,
`Traité`, `Remboursé`, `En attente`, commentaire et auteur) est stockée dans
`abo_paiements_suivi` et reste strictement propre aux Abonnements.

En l'absence de décision manuelle, une commande Abonnements est affichée *À
traiter*. Les statuts historiques des paiements cours ne sont ni lus ni copiés.
Un remboursement détecté par HelloAsso est comparé à la décision Abonnements
pour signaler les divergences à traiter par l'administrateur sur le site du club.

### Partagées avec la compta (déjà en place)

`HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET` (mêmes credentials que
« paiement des cours » ; le module abo filtre sur le lien du formulaire abo),
`EMAIL_SENDER` / `EMAIL_PASSWORD` (OTP compta), `CONVEX_SITE_URL`.

🔒 Aucun de ces secrets n'est journalisé : le scraper ne logue que le *host* et
des compteurs (jamais cookies, credentials, HTML, noms ou licences).

## Synchronisations à la demande (`convex/abo/sync.ts`)

`convex/crons.ts` est volontairement vide. Les anciens crons périodiques ont été
remplacés par des synchronisations déclenchées au chargement des pages utiles,
avec un verrou anti-rejeu partagé côté serveur. Une même source n'est
resynchronisée qu'une fois par fenêtre, environ 60 minutes par défaut et
configurable avec `SYNC_TTL_MINUTES`.

| Déclencheur | Action | Sources |
|---|---|---|
| Validation des paiements des cours | `api.abo.sync.syncPourPaiements` | HelloAsso |
| Espace admin Abonnements | `api.abo.sync.syncPourAbo` | HelloAsso → site club → annuaire → élèves |
| Tuile Licences élèves en cours | `api.abo.sync.syncPourLicencesCours` | Annuaire → élèves |

L'ordre des sources est intentionnel : les données HelloAsso doivent être
disponibles avant le matching des personnes.

Le bouton admin « Synchroniser le site club » appelle toujours
`api.abo.scrap.synchroniserClub` avec une garde `aboRole === "admin"`. Chacun des
deux boutons manuels (site club et paiements Abonnements) a son verrou serveur
de cinq minutes, partagé entre tous les administrateurs et leurs onglets. En cas
d'échec, le verrou concerné est restauré pour autoriser une nouvelle tentative
immédiate.

⚠️ Le compteur public ne se rafraîchit que lorsqu'un administrateur ouvre
l'application. Si une fraîcheur indépendante de toute présence devient
nécessaire, un cron lâche pourra être réintroduit dans `convex/crons.ts`, précédé
de `// CRON-OK: <raison>`.

## Checklist de validation e2e (à exécuter en dev une fois les secrets posés)

Cocher au fur et à mesure. La plupart nécessitent des secrets et/ou un
déploiement `npx convex dev` actif.

- [ ] **Auth/isolation 🔒** : email non-staff → OTP abo (console en dev) → n'ouvre
  QUE `/abonnements` ; `/` et les endpoints admin refusent. Staff avec tuile
  cochée → tuile visible + `/gestion-abonnements`.
- [ ] **Parcours vagues** : configurer `vague2_debut`/`vague3_debut` + peupler
  `abo_eleves_en_cours` → demande selon la vague → visible admin → validation →
  le suivi bascule sur les étapes de finalisation.
- [ ] **Licences** : importer un annuaire de test → personne sans licence obtient
  des candidats ; résolution auto (match exact) + validation manuelle la retirent
  de la file.
- [ ] **Test d'autonomie** : créer des créneaux (plusieurs admins) → tranches
  40/60 min à capacité cumulée ; réserver/annuler ; supprimer un créneau surbooké
  → délogement LIFO + email `test_annule`.
- [ ] **Formulaire du test** : depuis le suivi d'une personne validée, télécharger
  le PDF pré-rempli (date Europe/Paris, nom, prénom, licence) ; vérifier le
  rendu après réouverture et le cas d'une licence absente.
- [ ] **Compteur/anomalies** : peupler scrap/archive/élèves/validées → `occupe`
  sans double comptage ; anomalies = scrap non légitime ; iframe `/#/compteur`
  affiche les nombres **sans connexion**.
- [ ] **HelloAsso abo** : configurer le lien → sync remonte les paiements du
  formulaire abo ; statut manuel persistant ; désaccord local↔HA signalé.
- [ ] **Scraping club** : poser `CLUB_*` → « Synchroniser le site club » remonte
  les abonnés (`abo_abonnes_scrap`) et fait avancer les `etape_*` ; import élèves
  alimente `abo_eleves_en_cours` (badge « en cours »).
- [ ] **Reset saison** : archive N-1, vide scrap/paiements-abo/élèves/créneaux,
  purge les comptes publics par lots, conserve les staff ; nouveau lien + vagues
  réinitialisées.
- [ ] **Emails** : validation → email `validation` unique (pas de renvoi au
  re-scrap) ; demande → `accuse` ; création/annulation de créneau → `test_annule`.
- [ ] **Messagerie 🔒** : message instantané des deux côtés (réactivité Convex) ;
  un owner ne voit que son fil. L'espace admin affiche un compteur temps réel et
  une boîte de réception « Messages » qui priorise les conversations non lues ;
  l'ouverture du fil permet de les lire et d'y répondre. Un email
  `nouveau_message` prévient l'abonné d'une réponse administrative.
- [ ] **Non-régression compta** : login staff `google-otp` inchangé ; tuiles
  Comptabilité/Paiements/Budget intactes ; table `dossiers` (cours) non impactée.

## Nettoyage final

Les dossiers `abo-esca-new/` et `abo-esca-new/supabase/` servent uniquement de
**spécification** (contrats RPC, codes d'erreur `P0010`–`P0013`, migrations SQL,
modèle de données). Ils sont **non suivis par git** — leur suppression est
irréversible. À supprimer **une fois la checklist e2e ci-dessus validée**.
