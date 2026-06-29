// Calcul de paie — portage fidèle de l'onglet « Fiche de Paie » du fichier Excel
// Budget_Escalade. Source de vérité unique, utilisée pour l'affichage ET la
// simulation d'augmentation côté page Masse salariale.

export type TypeContrat = "CDII" | "CDI";

export type BaseCotisation = "brut" | "csgcrds" | "micro";

export interface CotisationSalariale {
  label: string;
  taux: number; // en %
  base: BaseCotisation;
}

export interface CotisationPatronale {
  label: string;
  taux: number; // en %
}

export interface ParametresPaie {
  margeSecurite: number;
  indemniteCpPct: number;
  mutuelleSalarie: number;
  mutuelleEmployeur: number;
  primeEquipementAnnuelle: number;
  fraisBulletin: number;
  cotisationsSalariales: CotisationSalariale[];
  cotisationsPatronales: CotisationPatronale[];
}

export interface SalaireInput {
  nom: string;
  typeContrat: TypeContrat;
  nbHeuresAnnuel: number;
  nbMois: number;
  tauxHoraireBrut: number;
}

export interface LigneCotisation {
  label: string;
  taux: number;
  montant: number;
}

export interface PaieResult {
  // Heures & taux
  heuresAnnuelEffectif: number; // heures annuelles réelles (CDI : converties)
  heuresMensuel: number;
  tauxEffectif: number;
  // Construction du brut
  salaire: number;
  indemniteCp: number;
  brut: number;
  // Cotisations salariales -> net
  cotisSalarialesDetail: LigneCotisation[];
  cotisSalariales: number;
  netAvantImpot: number;
  netMensuel: number; // net/mois estimé (après mutuelle salarié)
  netAnnuel: number;
  // Cotisations patronales -> coût employeur
  cotisPatronalesDetail: LigneCotisation[];
  cotisPatronales: number;
  coutMensuel: number;
  coutAnnuel: number; // budget annuel par salarié
}

/** Arrondi à 2 décimales (comportement ROUND() d'Excel). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Pour les CDI, le nombre d'heures saisi (heures « budget ») est converti en
// heures annuelles réelles via la formule de l'Excel :
//   heures réelles = 151,67 × 12 × (heures saisies / 1582)
// Les CDII utilisent les heures saisies telles quelles.
const HEURES_MENSUELLES_LEGALES = 151.67;
const HEURES_ANNUELLES_REFERENCE = 1582;

/** Heures annuelles effectives utilisées pour le calcul de paie. */
export function heuresAnnuellesEffectives(
  typeContrat: TypeContrat,
  nbHeuresAnnuel: number
): number {
  if (typeContrat === "CDI") {
    return round2(
      (HEURES_MENSUELLES_LEGALES * 12 * nbHeuresAnnuel) / HEURES_ANNUELLES_REFERENCE
    );
  }
  return nbHeuresAnnuel;
}

function baseValue(base: BaseCotisation, brut: number): number {
  switch (base) {
    case "csgcrds":
      return round2(brut * 0.9825);
    case "micro":
      return round2(brut * 0.002);
    case "brut":
    default:
      return brut;
  }
}

export interface ComputeOptions {
  /** Augmentation simulée appliquée au taux horaire brut, en %. */
  simulationPct?: number;
}

export function computePaie(
  input: SalaireInput,
  params: ParametresPaie,
  opts: ComputeOptions = {}
): PaieResult {
  const simulationPct = opts.simulationPct ?? 0;
  const nbMois = input.nbMois || 1;

  const heuresAnnuel = heuresAnnuellesEffectives(input.typeContrat, input.nbHeuresAnnuel);
  const heuresMensuel = round2(heuresAnnuel / nbMois);
  const tauxEffectif = input.tauxHoraireBrut * (1 + simulationPct / 100);
  const salaire = round2(heuresMensuel * tauxEffectif);

  const indemniteCp =
    input.typeContrat === "CDI"
      ? 0
      : round2(salaire * (params.indemniteCpPct / 100));
  const brut = round2(salaire + indemniteCp);

  const cotisSalarialesDetail: LigneCotisation[] = params.cotisationsSalariales.map(
    (c) => ({
      label: c.label,
      taux: c.taux,
      montant: round2(baseValue(c.base, brut) * (c.taux / 100)),
    })
  );
  const cotisSalariales = round2(
    cotisSalarialesDetail.reduce((s, c) => s + c.montant, 0)
  );

  const netAvantImpot = round2(brut - cotisSalariales);
  const netMensuel = round2(netAvantImpot - params.mutuelleSalarie);
  const netAnnuel = round2(netMensuel * nbMois);

  const cotisPatronalesDetail: LigneCotisation[] = params.cotisationsPatronales.map(
    (c) => ({
      label: c.label,
      taux: c.taux,
      montant: round2(brut * (c.taux / 100)),
    })
  );
  const cotisPatronales = round2(
    cotisPatronalesDetail.reduce((s, c) => s + c.montant, 0)
  );

  const coutMensuel = round2(
    brut +
      cotisPatronales +
      params.mutuelleEmployeur +
      params.primeEquipementAnnuelle / 12 +
      params.fraisBulletin
  );
  const coutAnnuel = round2(coutMensuel * nbMois);

  return {
    heuresAnnuelEffectif: heuresAnnuel,
    heuresMensuel,
    tauxEffectif: round2(tauxEffectif),
    salaire,
    indemniteCp,
    brut,
    cotisSalarialesDetail,
    cotisSalariales,
    netAvantImpot,
    netMensuel,
    netAnnuel,
    cotisPatronalesDetail,
    cotisPatronales,
    coutMensuel,
    coutAnnuel,
  };
}

export interface TotauxMasseSalariale {
  coutAnnuel: number;
  coutAnnuelAvecMarge: number;
  nbSalaries: number;
}

export function computeTotaux(
  results: PaieResult[],
  margeSecurite: number
): TotauxMasseSalariale {
  const coutAnnuel = round2(results.reduce((s, r) => s + r.coutAnnuel, 0));
  return {
    coutAnnuel,
    coutAnnuelAvecMarge: round2(coutAnnuel * margeSecurite),
    nbSalaries: results.length,
  };
}
