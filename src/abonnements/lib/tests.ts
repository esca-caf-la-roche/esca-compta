// Formatage des créneaux de test d'autonomie. Un créneau/tranche est un instant
// (ISO UTC) ; on l'AFFICHE toujours en heure de Paris pour que le même créneau
// montre la même heure quel que soit le fuseau du navigateur.
const TZ = "Europe/Paris";

// « lundi 12 sept. 2026 » (jour d'une tranche), heure de Paris.
export function formatJour(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// « 18:15 » (heure), heure de Paris.
export function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// « 18:00 – 18:40 » (début → fin), heure de Paris.
export function formatTranche(debut: string, fin: string | null): string {
  return fin ? `${formatHeure(debut)} – ${formatHeure(fin)}` : formatHeure(debut);
}

// Clé de regroupement par jour (YYYY-MM-DD en heure de Paris).
export function cleJour(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

// 'YYYY-MM-DD' (colonne date_jour) → « lundi 12 sept. 2026 ». Ancré à midi pour
// éviter tout glissement de jour selon le fuseau.
export function formatDateJour(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
