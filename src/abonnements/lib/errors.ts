// Extraction du message d'erreur d'une mutation Convex. Les endpoints abo lèvent
// des ConvexError({ code, message }) (portage des codes P0010/P0011/P0013…) : côté
// client, la charge utile est disponible sur `error.data`.
export interface AboError {
  code?: string;
  message: string;
}

export function aboError(e: unknown): AboError {
  const data = (e as { data?: unknown })?.data;
  if (data && typeof data === "object" && "message" in data) {
    const d = data as { code?: string; message?: string };
    return { code: d.code, message: d.message ?? "Erreur inconnue." };
  }
  const msg = (e as { message?: string })?.message ?? "Erreur inconnue.";
  return { message: msg };
}

// Formate une date ISO en français (date + heure courtes), avec repli lisible.
export function formatDateHeure(iso?: string | null): string {
  if (!iso) return "une date à venir";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "une date à venir"
    : d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}
