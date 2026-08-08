"use node";

// Action Node isolée : génération binaire du PDF avant l'envoi SMTP. Ce fichier
// ne contient aucune query/mutation afin de conserver le runtime Node valide.
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { TEST_AUTONOMIE_PDF_BASE64 } from "./testAutonomiePdf";

interface EmailReservationTest {
  destinataire: string;
  nom: string;
  prenom: string;
  licence: string | null;
  tranche: string;
}

function formaterTrancheParis(tranche: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(tranche));
}

function dateDuJourParis(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

async function creerPieceJointeRappel(
  email: EmailReservationTest,
): Promise<{ nom: string; contenuBase64: string; type: string }> {
  const pdf = await PDFDocument.load(Buffer.from(TEST_AUTONOMIE_PDF_BASE64, "base64"));
  const formulaire = pdf.getForm();
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  formulaire.getTextField("Date").setText(dateDuJourParis());
  formulaire.getTextField("Nom").setText(email.nom);
  formulaire.getTextField("Pr#C3#A9nom").setText(email.prenom);
  formulaire.getTextField("Licence").setText(email.licence?.trim() ?? "");
  formulaire.updateFieldAppearances(police);
  const bytes = await pdf.save();
  return {
    nom: "formulaire-test-autonomie.pdf",
    contenuBase64: Buffer.from(bytes).toString("base64"),
    type: "application/pdf",
  };
}

export const envoyerRappelTest = internalAction({
  args: { reservationId: v.id("abo_test_reservations") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const email: EmailReservationTest | null = await ctx.runMutation(
      internal.abo.emails.preparerRappelTest,
      { reservationId: args.reservationId },
    );
    if (!email) return null;

    const pieceJointe = await creerPieceJointeRappel(email);
    await ctx.runAction(internal.email.sendAboEmail, {
      to: email.destinataire,
      subject: "Rappel : votre test d'autonomie demain — imprimez votre formulaire",
      text:
        `Bonjour ${email.prenom},\n\n` +
        `Rappel : votre test d'autonomie est prévu ${formaterTrancheParis(email.tranche)}.\n\n` +
        "Le formulaire pré-rempli est joint à cet email. Imprimez-le et apportez-le le jour du test.\n\n" +
        "Sportivement,\nLa commission escalade du CAF La Roche / Bonneville",
      pieceJointe,
    });
    await ctx.runMutation(internal.abo.emails.marquerRappelTestEnvoye, {
      reservationId: args.reservationId,
    });
    return null;
  },
});
