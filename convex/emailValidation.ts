import { ConvexError } from "convex/values";

/** Valide un destinataire unique et renvoie sa forme canonique. */
export function canoniserEmailUnique(email: string): string {
  const canonique = email.trim().toLowerCase();
  if (
    !canonique ||
    canonique.length > 254 ||
    /[\r\n,;<>\s]/.test(canonique)
  ) {
    throw new ConvexError({ code: "EMAIL_INVALIDE", message: "Adresse email invalide." });
  }
  const morceaux = canonique.split("@");
  if (morceaux.length !== 2) {
    throw new ConvexError({ code: "EMAIL_INVALIDE", message: "Adresse email invalide." });
  }
  const [local, domaine] = morceaux;
  const labels = domaine.split(".");
  const localValide =
    local.length <= 64 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..");
  const domaineValide =
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-"),
    );
  if (!localValide || !domaineValide) {
    throw new ConvexError({ code: "EMAIL_INVALIDE", message: "Adresse email invalide." });
  }
  return canonique;
}
