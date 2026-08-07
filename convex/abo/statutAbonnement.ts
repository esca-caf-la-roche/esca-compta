import { v } from "convex/values";

export const statutAbonnementNormaliseValidator = v.union(
  v.literal("oui"),
  v.literal("non"),
  v.literal("bloque"),
  v.literal("inconnu"),
);

export type StatutAbonnementNormalise =
  | "oui"
  | "non"
  | "bloque"
  | "inconnu";

/**
 * Normalise le format historique (booléen) et le format textuel courant.
 * Un ancien `false` est volontairement inconnu : il encodait indifféremment
 * « Non », « Bloqué » ou une valeur absente dans l'ancien scraper.
 */
export function normaliserStatutAbonnement(
  valeur: unknown,
): StatutAbonnementNormalise {
  if (valeur === true || valeur === "oui") return "oui";
  if (valeur === "non") return "non";
  if (valeur === "bloque") return "bloque";
  return "inconnu";
}

export function abonnementEstValide(valeur: unknown): boolean {
  return normaliserStatutAbonnement(valeur) === "oui";
}
