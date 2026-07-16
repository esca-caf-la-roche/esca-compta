// Utilitaires de comparaison pour les upserts idempotents.
//
// Objectif : ne PAS réécrire une fiche quand seuls des champs volatils
// (tampons de date : synced_at / imported_at / last_scrap_at) changeraient.
// Une écriture inutile coûte DOUBLE : elle facture un write ET invalide toutes
// les queries temps réel abonnées à la table, qui la relisent alors en entier
// (read amplification). Sauter ces no-op est le principal levier de réduction
// du Database I/O des synchros (crons + on-demand).

// Renvoie true si au moins un champ de `doc` (hors clés `ignorer`) diffère de
// la fiche existante. Comparaison de surface : les docs d'upsert sont plats
// (scalaires + optionnels), aucune valeur imbriquée à comparer en profondeur.
export function champsModifies<T extends Record<string, unknown>>(
  existant: Record<string, unknown>,
  doc: T,
  ignorer: readonly (keyof T & string)[] = [],
): boolean {
  for (const cle of Object.keys(doc)) {
    if (ignorer.includes(cle)) continue;
    if (existant[cle] !== doc[cle]) return true;
  }
  return false;
}
