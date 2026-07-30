export const TILE_OPTIONS = [
  { id: "compta", label: "Comptabilité" },
  { id: "paiements", label: "Paiements Escalade" },
  { id: "budget", label: "Budget prévisionnel" },
  { id: "abonnements", label: "Abonnements Escalade" },
  { id: "licences_cours", label: "Licences élèves en cours" },
  { id: "contacts_cours", label: "Contacts élèves en cours" },
] as const;

export type TileId = (typeof TILE_OPTIONS)[number]["id"];

const KNOWN_TILE_IDS = new Set<string>(TILE_OPTIONS.map(({ id }) => id));

export function isKnownTileId(tileId: string): tileId is TileId {
  return KNOWN_TILE_IDS.has(tileId);
}

export function unknownTileIds(tileIds: readonly string[]): string[] {
  return tileIds.filter((tileId) => !isKnownTileId(tileId));
}
