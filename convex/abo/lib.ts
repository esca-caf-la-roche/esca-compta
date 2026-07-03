// Helpers purs du module Abonnements (runtime Convex par défaut, importables
// depuis les queries/mutations). Portage des triggers/normalisation Postgres de
// abo-esca-new (pas de generated columns ni d'extension unaccent/pg_trgm en Convex).

// Normalisation nom+prénom (clé de matching) : MAJUSCULES, sans accents, espaces
// réduits. Équivalent de public.normaliser_nom_prenom(nom, prenom) :
//   upper(btrim(regexp_replace(unaccent(nom || ' ' || prenom), '\s+', ' ', 'g')))
// Ex. «  Dûpont  » + « JEAN  rené » → "DUPONT JEAN RENE".
export function normaliserNomPrenom(nom?: string | null, prenom?: string | null): string {
  const brut = `${nom ?? ""} ${prenom ?? ""}`;
  return brut
    .normalize("NFD") // sépare lettres et diacritiques (é → e + ́)
    .replace(/[̀-ͯ]/g, "") // supprime les diacritiques
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Canonisation d'un numéro de licence (équivalent du trigger tg_normaliser_licence).
// Le format canonique = 12 chiffres. On accepte 12 ou 14 chiffres saisis
// (14 = clé de contrôle incluse) et on retient les 12 premiers. Toute autre
// longueur (ou vide) → null (licence considérée comme non renseignée).
export function canoniserLicence(licence?: string | null): string | null {
  const digits = (licence ?? "").replace(/\D/g, "");
  if (digits.length === 12 || digits.length === 14) return digits.slice(0, 12);
  return null;
}

// Vrai si la chaîne saisie a un format de licence plausible (12 ou 14 chiffres).
export function licenceFormatOk(licence?: string | null): boolean {
  const len = (licence ?? "").replace(/\D/g, "").length;
  return len === 12 || len === 14;
}

// Trigrammes (avec padding, façon pg_trgm) d'une chaîne normalisée.
function trigrammes(s: string): Set<string> {
  const t = `  ${s.trim().toLowerCase()} `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

// Similarité trigramme (Jaccard) ∈ [0,1], portage approché de pg_trgm.similarity
// pour classer les candidats licence par proximité nom/prénom.
export function similarite(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrammes(a);
  const tb = trigrammes(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}
