// Messagerie interne du module Abonnements (Phase K) : un fil par dossier,
// partagé entre l'abonné (owner) et les admins. Temps réel « gratuit » grâce à
// la réactivité des queries Convex (getFil se réabonne à chaque écriture).
//
// Portage de la table messages + RLS messages_* de abo-esca-new (jamais
// implémentée côté front dans la source : construite ici). Sécurité : chaque
// endpoint vérifie l'appartenance du dossier (owner) ou le rôle admin via
// requireOwnedDossier / requireAboAdmin. 🔒 Non-lu géré par 2 booléens.

import { v, ConvexError } from "convex/values";
import { authenticatedQuery, authenticatedMutation } from "../customFunctions";
import { internal } from "../_generated/api";
import { requireOwnedDossier, requireAboAdmin, getAboIdentity } from "./auth";

// ── envoyerMessage : owner ou admin poste dans le fil du dossier ─────────
export const envoyerMessage = authenticatedMutation({
  args: { dossierId: v.id("abo_dossiers"), contenu: v.string() },
  handler: async (ctx, args) => {
    const { identity } = await requireOwnedDossier(ctx, args.dossierId);
    const contenu = args.contenu.trim();
    if (!contenu) {
      throw new ConvexError({ code: "22023", message: "Message vide." });
    }
    if (contenu.length > 4000) {
      throw new ConvexError({ code: "22023", message: "Message trop long (4000 caractères max)." });
    }

    const estAdmin = identity.aboRole === "admin";
    await ctx.db.insert("abo_messages", {
      dossier_id: args.dossierId,
      auteur_id: identity.userId,
      auteur_role: estAdmin ? "admin" : "utilisateur",
      contenu,
      // Le côté de l'auteur a « lu » son propre message ; l'autre côté ne l'a pas.
      lu_par_admin: estAdmin,
      lu_par_user: !estAdmin,
    });

    // Notification email de l'ABONNÉ quand un ADMIN écrit (l'abonné ne surveille
    // pas le tableau de bord). Le sens inverse (abonné → club) est signalé aux
    // admins par les badges non-lus temps réel du tableau de bord.
    if (estAdmin) {
      await ctx.scheduler.runAfter(0, internal.abo.emails.envoyerEmailAbo, {
        dossierId: args.dossierId,
        typeEmail: "nouveau_message",
      });
    }
    return null;
  },
});

// ── getFil : messages d'un dossier (réactif = temps réel) ────────────────
export const getFil = authenticatedQuery({
  args: { dossierId: v.id("abo_dossiers") },
  handler: async (ctx, args) => {
    const { identity } = await requireOwnedDossier(ctx, args.dossierId);
    const messages = await ctx.db
      .query("abo_messages")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", args.dossierId))
      .collect();
    return messages
      .sort((a, b) => a._creationTime - b._creationTime)
      .map((m) => ({
        id: m._id,
        auteur_role: m.auteur_role,
        contenu: m.contenu,
        created_at: m._creationTime,
        est_moi: m.auteur_id === identity.userId,
        lu_par_admin: m.lu_par_admin,
        lu_par_user: m.lu_par_user,
      }));
  },
});

// ── marquerLu : marque comme lus les messages de l'autre partie ──────────
// Appelé à l'ouverture du fil. L'admin marque lu_par_admin, l'owner lu_par_user.
export const marquerLu = authenticatedMutation({
  args: { dossierId: v.id("abo_dossiers") },
  handler: async (ctx, args) => {
    const { identity } = await requireOwnedDossier(ctx, args.dossierId);
    const estAdmin = identity.aboRole === "admin";
    const messages = await ctx.db
      .query("abo_messages")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", args.dossierId))
      .collect();
    let maj = 0;
    for (const m of messages) {
      if (estAdmin && !m.lu_par_admin) {
        await ctx.db.patch(m._id, { lu_par_admin: true });
        maj++;
      } else if (!estAdmin && !m.lu_par_user) {
        await ctx.db.patch(m._id, { lu_par_user: true });
        maj++;
      }
    }
    return maj;
  },
});

// ── mesMessagesNonLus : compteur pour le badge de l'abonné (owner) ───────
export const mesMessagesNonLus = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await getAboIdentity(ctx);
    if (!identity) return 0;
    const dossier = await ctx.db
      .query("abo_dossiers")
      .withIndex("by_owner", (q) => q.eq("owner_id", identity.userId))
      .first();
    if (!dossier) return 0;
    const messages = await ctx.db
      .query("abo_messages")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
      .collect();
    return messages.filter((m) => !m.lu_par_user).length;
  },
});

// ── messagesNonLusAdmin : nb de non-lus par dossier (badges admin) ───────
export const messagesNonLusAdmin = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);
    const messages = await ctx.db.query("abo_messages").collect();
    const parDossier = new Map<string, number>();
    for (const m of messages) {
      if (m.lu_par_admin) continue;
      const cle = m.dossier_id as unknown as string;
      parDossier.set(cle, (parDossier.get(cle) ?? 0) + 1);
    }
    return Array.from(parDossier, ([dossierId, count]) => ({ dossierId, count }));
  },
});
