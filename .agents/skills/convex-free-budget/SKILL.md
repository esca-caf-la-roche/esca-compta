---
name: convex-free-budget
description: Mesure et protège le quota gratuit Convex de esca-compta. Utiliser pour toute question sur Database I/O, function calls, consommation, coût, quota, pic DEV/PROD, optimisation Convex, usage limits, ou avant d'ajouter une query réactive, un scan, une synchronisation ou un cron.
---

# Budget Convex gratuit

Conserver le projet sous la limite gratuite sans attribuer un pic au mauvais
déploiement et sans remplacer les preuves par une revue statique.

## Diagnostic obligatoire

1. Appliquer `convex-deploy-guard` et annoncer les cibles lues.
2. Exécuter `npm run audit:convex-io`. Comparer `current_day` et
   `current_month` pour DEV et PROD. Le quota de 1 Go est agrégé par équipe :
   l'addition du projet peut rester inférieure au tableau global.
3. Lire les journaux récents avec succès et additionner uniquement
   `databaseIoReadBytes + databaseIoWriteBytes` des événements `Completion`.
   Classer à la fois par octets et par nombre d'appels. Ne jamais afficher les
   arguments, retours ou données personnelles.
4. Lire `insights` sur 72 h. L'absence d'insight exclut un dépassement par
   exécution, pas une accumulation de nombreuses petites lectures.
5. Relier les fonctions dominantes à leurs `useQuery`, lectures, écritures et
   synchronisations. Comparer aux commits et déploiements de la période.

## Ordre des optimisations

1. Arrêter une boucle, un watcher ou un serveur DEV cloud inutile.
2. Stabiliser les arguments des queries ; utiliser `"skip"` avant que les
   arguments soient prêts et arrondir le temps à la minute au maximum.
3. Charger les détails coûteux à la demande lorsque la fraîcheur temps réel
   n'apporte rien au parcours principal.
4. Remplacer scan + filtre par un index, puis borner ou paginer.
5. Éviter les écritures identiques avec `champsModifies`, surtout dans les
   imports qui invalident des abonnements réactifs.
6. N'introduire digest, agrégat ou migration que si les journaux ou une
   croissance non bornée le justifient.

## Discipline agentique

- Utiliser `npm run check:convex`, les tests, le lint et le build pour valider.
- Ne pas lancer `convex dev --once` sur le cloud comme simple typecheck.
- Lancer un serveur agentique avec `convex dev --local`. Ajouter
  `# CLOUD-DEV-OK: <raison>` seulement lorsqu'une intégration cloud est
  indispensable et après avoir annoncé le coût potentiel.
- Fermer les watchers, flux de logs et onglets de test à la fin du travail.
- Ne jamais modifier une limite d'usage PROD sans consentement explicite frais.
  Proposer des seuils par déploiement en conservant une marge pour les autres
  projets de l'équipe.

## Rapport attendu

Donner : DEV jour/mois, PROD jour/mois, total du projet, part du quota,
fonctions dominantes avec appels et octets, cause confirmée, hypothèses encore
bornées, gain attendu des corrections et commande de re-mesure.

Le script `scripts/report-usage.mjs` est en lecture seule. `--check` renvoie un
code non nul au-dessus de 5 % du quota sur la journée ou 70 % sur le mois ; ces
seuils peuvent être ajustés par `CONVEX_IO_DAILY_WARNING_RATIO` et
`CONVEX_IO_MONTHLY_WARNING_RATIO`.
