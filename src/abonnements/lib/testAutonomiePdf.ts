import { PDFDocument, StandardFonts } from "pdf-lib";
import formulaireTestAutonomieUrl from "../assets/test-d-autonomie.pdf";

const PDF_CONTENT_TYPE = "application/pdf";

export type PersonneFormulaireTest = {
  nom: string;
  prenom: string;
  licence?: string | null;
};

function dateDuJourParis(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

/** Génère le formulaire officiel sans transmettre l'identité hors du navigateur. */
export async function creerFormulaireTestAutonomie(
  personne: PersonneFormulaireTest,
): Promise<Blob> {
  try {
    const reponse = await fetch(formulaireTestAutonomieUrl);
    if (!reponse.ok) throw new Error("Modèle indisponible");

    const pdf = await PDFDocument.load(await reponse.arrayBuffer());
    const formulaire = pdf.getForm();
    const police = await pdf.embedFont(StandardFonts.Helvetica);
    formulaire.getTextField("Date").setText(dateDuJourParis());
    formulaire.getTextField("Nom").setText(personne.nom);
    // Le nom technique du champ est encodé dans le PDF officiel.
    formulaire.getTextField("Pr#C3#A9nom").setText(personne.prenom);
    formulaire.getTextField("Licence").setText(personne.licence?.trim() ?? "");
    formulaire.updateFieldAppearances(police);
    const bytes = await pdf.save();
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    return new Blob([blobBytes.buffer], { type: PDF_CONTENT_TYPE });
  } catch {
    throw new Error("Le formulaire ne peut pas être préparé. Réessayez plus tard.");
  }
}

export function telechargerPdf(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
