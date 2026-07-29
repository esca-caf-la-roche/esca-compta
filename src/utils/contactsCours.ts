export function normaliserRecherche(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim();
}

export function separerEncadrants(value: string | null | undefined): string[] {
  if (!value) return [];

  return [...new Set(
    value
      .split(/\s*(?:,|;|\/|\||\bet\b)\s*/i)
      .map((encadrant) => encadrant.trim())
      .filter(Boolean),
  )];
}

export function normaliserTelephoneWhatsApp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const nettoye = value.trim().replace(/[^\d+]/g, "");
  if (!nettoye) return null;

  let numero: string;
  if (nettoye.startsWith("+")) {
    numero = nettoye.slice(1).replace(/\D/g, "");
  } else if (nettoye.startsWith("00")) {
    numero = nettoye.slice(2).replace(/\D/g, "");
  } else {
    const chiffres = nettoye.replace(/\D/g, "");
    if (chiffres.startsWith("0")) {
      numero = `33${chiffres.slice(1)}`;
    } else if (/^[67]\d{8}$/.test(chiffres)) {
      numero = `33${chiffres}`;
    } else {
      numero = chiffres;
    }
  }

  // Les annuaires français écrivent parfois « +33 (0)6… » : le zéro
  // national doit disparaître dans le format international WhatsApp.
  if (numero.startsWith("330")) numero = `33${numero.slice(3)}`;

  return /^\d{8,15}$/.test(numero) ? numero : null;
}

export function emailsUniques(values: Array<string | null | undefined>): string[] {
  const uniques = new Map<string, string>();

  for (const value of values) {
    const email = value?.trim();
    if (!email) continue;
    const cle = email.toLocaleLowerCase("fr");
    if (!uniques.has(cle)) uniques.set(cle, email);
  }

  return [...uniques.values()];
}

export function creerLienMailtoBcc(emails: string[]): string {
  return `mailto:?bcc=${encodeURIComponent(emails.join(","))}`;
}
