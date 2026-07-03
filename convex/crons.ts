// Crons Convex — Phase H (module Abonnements escalade).
// Tâches planifiées d'alimentation des données du module :
//   - scrap des abonnés du site club (+ matching scrap → personnes) ;
//   - synchro HelloAsso (dossiers/transactions, préserve les statuts locaux) ;
//   - import de l'export « élèves en cours » (passe-droit vague 2).
//
// Fréquences volontairement modérées (le site club n'a pas d'API : on limite la
// charge) et ajustables. Le bouton admin « Synchroniser maintenant »
// (abo/scrap.synchroniserClub) permet un déclenchement manuel entre deux crons.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Abonnés club → abo_abonnes_scrap + matching des étapes des personnes.
crons.interval(
  "abo scrap abonnes club",
  { hours: 1 },
  internal.abo.scrap.scraperAbonnes,
  {},
);

// HelloAsso → dossiers/transactions (formulaire abo + cours ; champs locaux préservés).
crons.interval(
  "abo sync helloasso",
  { hours: 1 },
  internal.helloasso.syncHelloAssoInternal,
  {},
);

// Export « élèves en cours » (change rarement : cadence plus lâche).
crons.interval(
  "abo import eleves en cours",
  { hours: 6 },
  internal.abo.scrap.importerElevesEnCours,
  {},
);

export default crons;
