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
| **Abonnés publics** | provider `abo-otp` (auto-inscription OTP, boîte mail dédiée) | Espace isolé `/#/abonnements` uniquement (aucune mention compta) | ligne `abo_profiles` (role `utilisateur`), **jamais** de `userSettings` |

🔒 **Cloisonnement** : `getAboIdentity` (`convex/abo/auth.ts`) dérive le rôle admin
**exclusivement** de `userSettings.allowedTiles` — le rôle `"admin"` compta ne
donne aucun passe-droit. Un abonné public n'a pas de `userSettings`, donc aucun
accès aux tuiles compta ; le `Layout` le redirige vers `/abonnements`.

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

### Partagées avec la compta (déjà en place)

`HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET` (mêmes credentials que
« paiement des cours » ; le module abo filtre sur le lien du formulaire abo),
`EMAIL_SENDER` / `EMAIL_PASSWORD` (OTP compta), `CONVEX_SITE_URL`.

🔒 Aucun de ces secrets n'est journalisé : le scraper ne logue que le *host* et
des compteurs (jamais cookies, credentials, HTML, noms ou licences).

## Tâches planifiées (`convex/crons.ts`)

| Cron (identifiant ASCII) | Fréquence | Cible |
|---|---|---|
| `abo scrap abonnes club` | 1 h | `internal.abo.scrap.scraperAbonnes` (scrap + matching intégré) |
| `abo sync helloasso` | 1 h | `internal.helloasso.syncHelloAssoInternal` |
| `abo import eleves en cours` | 6 h | `internal.abo.scrap.importerElevesEnCours` |

Bouton admin manuel « Synchroniser le site club » → `api.abo.scrap.synchroniserClub`
(garde `aboRole === "admin"`).

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
  un owner ne voit que son fil ; badge admin + email abonné `nouveau_message`.
- [ ] **Non-régression compta** : login staff `google-otp` inchangé ; tuiles
  Comptabilité/Paiements/Budget intactes ; table `dossiers` (cours) non impactée.

## Nettoyage final

Les dossiers `abo-esca-new/` et `abo-esca-new/supabase/` servent uniquement de
**spécification** (contrats RPC, codes d'erreur `P0010`–`P0013`, migrations SQL,
modèle de données). Ils sont **non suivis par git** — leur suppression est
irréversible. À supprimer **une fois la checklist e2e ci-dessus validée**.
