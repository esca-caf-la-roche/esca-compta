export type TypeFormulaireRemboursement = "competition" | "stage";
export type TypeEmailRemboursement = "initial" | "relance";

export const COMPTE_GMAIL_REMBOURSEMENTS =
  "escalade@caflarochebonneville.fr";

export const LIENS_HELLOASSO_REMBOURSEMENTS: Record<
  TypeFormulaireRemboursement,
  string
> = {
  competition:
    "https://www.helloasso.com/associations/caf-la-roche-bonneville/paiements/esc07-remboursement-inscriptions-competition",
  stage:
    "https://www.helloasso.com/associations/caf-la-roche-bonneville/paiements/esc11-remboursement-stage",
};

export function normaliserRechercheRemboursement(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim();
}

export function formatEuros(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

export function eurosVersCentimes(value: string): number | null {
  const normalise = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalise)) return null;
  const centimes = Math.round(Number(normalise) * 100);
  return Number.isSafeInteger(centimes) && centimes > 0 ? centimes : null;
}

export function messageErreurRemboursement(
  error: unknown,
  fallback: string,
): string {
  const data = (error as { data?: unknown })?.data;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message && message !== "Server Error"
    ? message
    : fallback;
}

export function creerLienGmailRemboursement({
  destinataire,
  sujet,
  corps,
}: {
  destinataire: string;
  sujet: string;
  corps: string;
}): string {
  const adresse = normaliserAdresseEmailUnique(destinataire);
  if (!adresse) {
    throw new TypeError("Adresse email individuelle invalide.");
  }
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("authuser", COMPTE_GMAIL_REMBOURSEMENTS);
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  url.searchParams.set("to", adresse);
  url.searchParams.set("su", sujet);
  url.searchParams.set("body", corps);
  return url.toString();
}

export function creerLienGmailRemboursementGroupe({
  destinatairesCci,
  sujet,
  corps,
}: {
  destinatairesCci: string[];
  sujet: string;
  corps: string;
}): string {
  const adresses = [...new Set(destinatairesCci.map(normaliserAdresseEmailUnique).filter((email): email is string => Boolean(email)))];
  if (adresses.length === 0) throw new TypeError("Aucune adresse e-mail valide.");
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("authuser", COMPTE_GMAIL_REMBOURSEMENTS);
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  url.searchParams.set("bcc", adresses.join(","));
  url.searchParams.set("su", sujet);
  url.searchParams.set("body", corps);
  return url.toString();
}

export function preparerEmailRemboursementGroupe({
  typeEmail,
  libelle,
  lienHelloAsso,
}: {
  typeEmail: TypeEmailRemboursement;
  libelle: string;
  lienHelloAsso: string;
}): { sujet: string; corps: string } {
  const relance = typeEmail === "relance";
  return {
    sujet: `${relance ? "Relance — " : ""}Remboursement ${libelle}`,
    corps: [
      "Bonjour,",
      "",
      relance
        ? `Sauf erreur de notre part, le remboursement concernant « ${libelle} » reste à régler.`
        : `Le remboursement concernant « ${libelle} » est à régler.`,
      "",
      `Vous pouvez effectuer le règlement via HelloAsso : ${lienHelloAsso}`,
      "",
      "Merci,",
      "Le club d’escalade CAF La Roche-Bonneville",
    ].join("\n"),
  };
}

export function preparerEmailRemboursement({
  typeEmail,
  beneficiaire,
  libelle,
  montantCentimes,
  lienHelloAsso,
}: {
  typeEmail: TypeEmailRemboursement;
  beneficiaire: string;
  libelle: string;
  montantCentimes: number;
  lienHelloAsso: string;
}): { sujet: string; corps: string } {
  const relance = typeEmail === "relance";
  const sujet = `${relance ? "Relance — " : ""}Remboursement ${libelle}`;
  const introduction = relance
    ? `Sauf erreur de notre part, le remboursement de ${formatEuros(montantCentimes)} pour « ${libelle} » reste à régler.`
    : `Le montant à rembourser pour « ${libelle} » est de ${formatEuros(montantCentimes)}.`;

  return {
    sujet,
    corps: [
      "Bonjour,",
      "",
      `Concernant ${beneficiaire},`,
      "",
      introduction,
      "",
      `Vous pouvez effectuer le règlement via HelloAsso : ${lienHelloAsso}`,
      "",
      "Merci,",
      "Le club d’escalade CAF La Roche-Bonneville",
    ].join("\n"),
  };
}
import { normaliserAdresseEmailUnique } from "./contactsCours";
