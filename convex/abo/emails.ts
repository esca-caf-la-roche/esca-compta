// Emails transactionnels du module Abonnements (Phase J). Envoi via la boîte
// mail DISTINCTE de l'OTP compta (internal.email.sendAboEmail, secrets
// EMAIL_SENDER_ABO / EMAIL_PASSWORD_ABO ; échec explicite si absents).
//
// Pipeline (déclenché par ctx.scheduler.runAfter depuis les mutations) :
//   1. contexteEmail  (query)    → destinataire + prénoms + liens de finalisation
//   2. journaliser    (mutation) → anti-doublon abo_email_log (sauf test_annule)
//   3. sendAboEmail   (action)   → envoi réel
// L'anti-doublon (une entrée par dossier+type) empêche le renvoi au re-scrap ;
// test_annule fait exception (chaque annulation notifie). 🔒

import { v } from "convex/values";
import { internalQuery, internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getConfigValeur } from "./config";

// Types d'emails (sous-ensemble du champ abo_email_log.type_email).
export const typeEmailValidator = v.union(
  v.literal("accuse"),
  v.literal("validation"),
  v.literal("liste_attente"),
  v.literal("refus"),
  v.literal("nouveau_message"),
  v.literal("test_annule"),
);
type TypeEmail =
  | "accuse"
  | "validation"
  | "liste_attente"
  | "refus"
  | "nouveau_message"
  | "test_annule";

interface Liens {
  licence_nouvelle: string | null;
  licence_renouvellement: string | null;
  compte_activation: string | null;
  inscription: string | null;
  helloasso: string | null;
  test_autonomie: string | null;
}
interface ContexteEmail {
  destinataire: string;
  prenoms: string[];
  liens: Liens;
}

// ── contexteEmail : destinataire + prénoms + liens (interne) ─────────────
export const contexteEmail = internalQuery({
  args: { dossierId: v.id("abo_dossiers") },
  handler: async (ctx, args): Promise<ContexteEmail | null> => {
    const dossier = await ctx.db.get(args.dossierId);
    if (!dossier || !dossier.email) return null;
    const personnes = await ctx.db
      .query("abo_personnes")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
      .collect();
    return {
      destinataire: dossier.email,
      prenoms: personnes.map((p) => p.prenom).filter((s): s is string => !!s),
      liens: {
        licence_nouvelle: await getConfigValeur(ctx, "licence_lien_nouvelle"),
        licence_renouvellement: await getConfigValeur(ctx, "licence_lien_renouvellement"),
        compte_activation: await getConfigValeur(ctx, "compte_activation_lien"),
        inscription: await getConfigValeur(ctx, "inscription_lien"),
        helloasso: await getConfigValeur(ctx, "helloasso_lien"),
        test_autonomie: await getConfigValeur(ctx, "test_autonomie_lien"),
      },
    };
  },
});

// ── journaliser : anti-doublon + trace d'envoi (interne) ─────────────────
// Renvoie true si l'email doit être envoyé (nouvelle entrée), false si déjà
// journalisé pour ce dossier+type (dedup). test_annule passe dedup=false.
export const journaliser = internalMutation({
  args: {
    dossierId: v.id("abo_dossiers"),
    typeEmail: typeEmailValidator,
    destinataire: v.string(),
    dedup: v.boolean(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    if (args.dedup) {
      const logs = await ctx.db
        .query("abo_email_log")
        .withIndex("by_dossier", (q) => q.eq("dossier_id", args.dossierId))
        .collect();
      if (logs.some((l) => l.type_email === args.typeEmail)) return false;
    }
    await ctx.db.insert("abo_email_log", {
      dossier_id: args.dossierId,
      type_email: args.typeEmail,
      destinataire: args.destinataire,
      sent_at: new Date().toISOString(),
    });
    return true;
  },
});

// ── Templates (purs) ─────────────────────────────────────────────────────
function saluer(prenoms: string[]): string {
  const uniques = [...new Set(prenoms)];
  if (uniques.length === 0) return "Bonjour,";
  return `Bonjour ${uniques.join(", ")},`;
}

const SIGNATURE = "\n\nSportivement,\nLa commission escalade du CAF La Roche / Bonneville";

// Puces des liens de finalisation configurés (validation).
function lignesLiens(liens: Liens): string {
  const items: string[] = [];
  if (liens.licence_nouvelle || liens.licence_renouvellement) {
    const l = [liens.licence_nouvelle, liens.licence_renouvellement].filter(Boolean).join("\n  ");
    items.push(`• Prendre / renouveler votre licence FFCAM :\n  ${l}`);
  }
  if (liens.compte_activation) items.push(`• Activer votre compte sur le site du club :\n  ${liens.compte_activation}`);
  if (liens.inscription) items.push(`• Vous inscrire au créneau autonome :\n  ${liens.inscription}`);
  if (liens.helloasso) items.push(`• Régler votre abonnement (HelloAsso) :\n  ${liens.helloasso}`);
  if (liens.test_autonomie) items.push(`• Test d'autonomie (si nécessaire) :\n  ${liens.test_autonomie}`);
  return items.length ? items.join("\n") : "Les liens de finalisation vous seront communiqués prochainement.";
}

function construireEmail(type: TypeEmail, ctxData: ContexteEmail): { subject: string; text: string } {
  const bonjour = saluer(ctxData.prenoms);
  switch (type) {
    case "accuse":
      return {
        subject: "Votre demande d'abonnement escalade a bien été reçue",
        text:
          `${bonjour}\n\nNous avons bien reçu votre demande d'accès aux créneaux ` +
          `d'escalade autonome. Elle sera examinée par la commission escalade ; ` +
          `vous recevrez un email dès qu'une décision aura été prise.` +
          SIGNATURE,
      };
    case "validation":
      return {
        subject: "Votre demande d'abonnement escalade est validée",
        text:
          `${bonjour}\n\nBonne nouvelle : votre demande a été validée ! Il vous ` +
          `reste à finaliser les étapes suivantes pour être définitivement inscrit·e :\n\n` +
          `${lignesLiens(ctxData.liens)}\n\n` +
          `Vous pouvez suivre l'avancement de ces étapes depuis votre espace en ligne.` +
          SIGNATURE,
      };
    case "liste_attente":
      return {
        subject: "Votre demande d'abonnement escalade est en liste d'attente",
        text:
          `${bonjour}\n\nVotre demande a bien été enregistrée et placée en ` +
          `liste d'attente : le nombre de places pour les créneaux autonomes est ` +
          `limité. Nous vous recontacterons dès qu'une place se libère.` +
          SIGNATURE,
      };
    case "refus":
      return {
        subject: "Votre demande d'abonnement escalade",
        text:
          `${bonjour}\n\nAprès examen, nous ne sommes malheureusement pas en ` +
          `mesure de donner une suite favorable à votre demande d'accès aux ` +
          `créneaux autonomes pour cette saison. N'hésitez pas à revenir vers la ` +
          `commission escalade pour toute question.` +
          SIGNATURE,
      };
    case "test_annule":
      return {
        subject: "Votre créneau de test d'autonomie a été annulé",
        text:
          `${bonjour}\n\nVotre créneau de test d'autonomie a dû être annulé. ` +
          `Merci de vous reconnecter à votre espace pour réserver un nouveau ` +
          `créneau parmi les disponibilités proposées.` +
          SIGNATURE,
      };
    case "nouveau_message":
      return {
        subject: "Nouveau message de la commission escalade",
        text:
          `${bonjour}\n\nVous avez reçu un nouveau message concernant votre ` +
          `demande d'abonnement escalade. Connectez-vous à votre espace pour le ` +
          `consulter et y répondre.` +
          SIGNATURE,
      };
  }
}

// ── envoyerEmailAbo : orchestrateur (interne, planifié par les mutations) ──
export const envoyerEmailAbo = internalAction({
  args: {
    dossierId: v.id("abo_dossiers"),
    typeEmail: typeEmailValidator,
  },
  handler: async (ctx, args): Promise<null> => {
    const ctxData: ContexteEmail | null = await ctx.runQuery(
      internal.abo.emails.contexteEmail,
      { dossierId: args.dossierId },
    );
    if (!ctxData) return null;

    // Emails de cycle de vie du dossier : 1 seul par type (anti-renvoi au
    // re-scrap). Les emails ÉVÉNEMENTIELS (message, annulation de test) notifient
    // à chaque occurrence → pas de dedup.
    const dedup =
      args.typeEmail === "accuse" ||
      args.typeEmail === "validation" ||
      args.typeEmail === "liste_attente" ||
      args.typeEmail === "refus";
    const doitEnvoyer: boolean = await ctx.runMutation(
      internal.abo.emails.journaliser,
      {
        dossierId: args.dossierId,
        typeEmail: args.typeEmail,
        destinataire: ctxData.destinataire,
        dedup,
      },
    );
    if (!doitEnvoyer) return null;

    const { subject, text } = construireEmail(args.typeEmail as TypeEmail, ctxData);
    await ctx.runAction(internal.email.sendAboEmail, {
      to: ctxData.destinataire,
      subject,
      text,
    });
    return null;
  },
});
