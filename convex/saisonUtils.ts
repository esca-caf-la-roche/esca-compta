// Utilitaires de saison au format "YYYY-YY" (ex: "2025-26").

const SAISON_RE = /^(\d{4})-(\d{2})$/;

/** Saison précédente (ex: "2025-26" -> "2024-25"). */
export function previousSaison(saison: string): string | null {
  if (!SAISON_RE.test(saison)) return null;
  const start = parseInt(saison.slice(0, 4), 10) - 1;
  const end = (start + 1) % 100;
  return `${start}-${end.toString().padStart(2, "0")}`;
}

/** Saison suivante (ex: "2025-26" -> "2026-27"). */
export function nextSaison(saison: string): string | null {
  if (!SAISON_RE.test(saison)) return null;
  const start = parseInt(saison.slice(0, 4), 10) + 1;
  const end = (start + 1) % 100;
  return `${start}-${end.toString().padStart(2, "0")}`;
}
