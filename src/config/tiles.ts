export const TILE_OPTIONS = [
  { id: "compta", label: "Comptabilité", defaultColor: "bg-info" },
  { id: "paiements", label: "Paiements Escalade", defaultColor: "bg-success" },
  { id: "budget", label: "Budget prévisionnel", defaultColor: "bg-warning" },
  { id: "abonnements", label: "Abonnements Escalade", defaultColor: "bg-primary" },
  { id: "licences_cours", label: "Licences élèves en cours", defaultColor: "bg-danger" },
  { id: "contacts_cours", label: "Contacts élèves en cours", defaultColor: "bg-info" },
  { id: "remboursements_eleves", label: "Remboursements élèves", defaultColor: "bg-warning" },
] as const;

export type TileId = (typeof TILE_OPTIONS)[number]["id"];

const KNOWN_TILE_IDS = new Set<string>(TILE_OPTIONS.map(({ id }) => id));

export function isKnownTileId(tileId: string): tileId is TileId {
  return KNOWN_TILE_IDS.has(tileId);
}

export function unknownTileIds(tileIds: readonly string[]): string[] {
  return tileIds.filter((tileId) => !isKnownTileId(tileId));
}

export const TILE_COLOR_OPTIONS = [
  { value: "bg-info", label: "Bleu" },
  { value: "bg-success", label: "Vert" },
  { value: "bg-warning", label: "Jaune" },
  { value: "bg-primary", label: "Violet" },
  { value: "bg-danger", label: "Rouge" },
] as const;

export type TileColorClass = (typeof TILE_COLOR_OPTIONS)[number]["value"];
