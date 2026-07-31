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

### Scénarios ciblés — Contacts des cours

Ces scénarios sont manuels tant qu'aucune suite navigateur n'est installée :

1. attribuer `contacts_cours` à un compte staff, puis vérifier la tuile, la
   route `/contacts-cours` et l'absence du sélecteur de saison ;
2. retirer la tuile à un utilisateur, y compris administrateur, puis vérifier
   l'absence de la tuile, le refus de la route et le refus des endpoints ;
3. ouvrir la page avec un snapshot `abo_eleves_en_cours` disponible : vérifier
   la synchronisation à la demande de la seule source élèves, puis un second
   chargement respectant le verrou partagé ;
4. simuler l'échec de la source externe et vérifier que le dernier snapshot
   reste consultable avec un avertissement de fraîcheur ;
5. vérifier que les élèves en liste d'attente ne sont pas affichés, puis
   combiner la recherche nom/prénom avec les filtres cours, horaire et
   encadrant ; la recherche doit rester insensible à la casse et aux accents.
   Pour chaque facette, vérifier que les options tiennent compte de la recherche
   et des deux autres filtres, mais pas de sa propre sélection ; une sélection
   devenue impossible doit être automatiquement effacée ;
6. contrôler les priorités de contact : email et téléphone de l'élève, puis
   fallback vers le gestionnaire du dossier, enfin état « non renseigné ».
   Une valeur email contenant plusieurs adresses, un séparateur virgule ou
   point-virgule, ou un caractère de contrôle doit être refusée et ne jamais
   alimenter un brouillon Gmail ;
7. copier une adresse et ouvrir WhatsApp avec un numéro français normalisé :
   l'application doit s'ouvrir sur mobile et iPadOS tactile, tandis qu'un
   ordinateur doit ouvrir `https://web.whatsapp.com/send?phone=…` ; un numéro
   absent ou invalide doit désactiver l'action ;
8. filtrer un groupe contenant des emails dupliqués et des élèves sans email,
   puis ouvrir le brouillon Gmail : les adresses uniques doivent être en CCI et
   le paramètre `authuser` doit désigner
   `coursescalade@caflarochebonneville.fr`, sans appel d'envoi email côté
   serveur. Cliquer aussi sur un email individuel et vérifier le même compte
   Gmail avec l'adresse en destinataire principal.

### Scénarios ciblés — Remboursements élèves

1. attribuer `remboursements_eleves` à un compte staff et vérifier la tuile, la
   route gardée et l'absence du sélecteur de saison ; retirer ensuite la tuile
   et vérifier le refus frontend et backend, y compris pour un administrateur ;
2. créer une demande avec un total non divisible puis avec un prix fixe :
   vérifier que la somme des centimes attribués correspond exactement au total
   et que l'instantané des élèves reste lisible après renouvellement de la
   source `abo_eleves_en_cours` ;
3. ouvrir la tuile deux fois et vérifier les verrous d'une heure pour les élèves
   et HelloAsso ; simuler l'échec de chaque source et vérifier que le dernier
   cache reste affiché avec un avertissement non bloquant ;
4. ouvrir un brouillon initial puis une relance : Gmail doit s'ouvrir dans un
   nouvel onglet avec `escalade@caflarochebonneville.fr`, le destinataire unique,
   l'objet, le montant restant et le bon lien compétition ou stage. Une adresse
   invalide ou multi-adresses doit désactiver l'action. La date affichée reste
   une préparation de brouillon, jamais une preuve d'envoi ;
5. vérifier une suggestion par email, nom et montant, puis valider
   explicitement le rapprochement. Tester un paiement partiel, plusieurs
   paiements partiels, un dépassement du solde, un paiement déjà lié, un statut
   `pending`, un remboursement partiel et un remboursement total ;
6. vérifier que seuls les paiements autorisés comptent dans la progression,
   qu'une demande n'est archivable que lorsque tous les bénéficiaires sont
   soldés, puis tester restauration, annulation avec motif et pagination des
   demandes et archives ;
7. contrôler au clavier et sur mobile le formulaire, la sélection d'élèves,
   les onglets, le panneau de rapprochement et le bouton « Afficher plus ».

### Scénario ciblé — Configuration du tableau de bord

1. avec un compte administrateur, ouvrir Configurations → Tableau de bord,
   modifier l'ordre et la couleur de plusieurs tuiles, puis enregistrer ;
   vérifier le résultat après rechargement avec un autre compte staff ;
2. vérifier qu'un compte staff ne voit que ses tuiles autorisées, dans l'ordre
   global conservé, et que l'ordre ou la couleur ne lui donnent jamais accès à
   une route ou à des données non attribuées.

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
