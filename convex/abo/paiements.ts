// Paiements HelloAsso du formulaire ABONNEMENTS. Portage de lib/paiements.js +
// admin-paiements.js. On RÉUTILISE l'infra compta (convex/helloasso.ts) :
//   - le lien du formulaire abo vit dans helloasso_links (sync par syncHelloAsso) ;
//   - les commandes sont dans `dossiers` (filtrées par ce lien) et leurs échéances
//     / remboursements dans `helloasso_transactions`.
// Le SUIVI admin (statut interne + commentaire + auteur) réutilise les champs
// locaux du dossier (local_status/comment/updated_by/updated_at), que la sync ne
// réécrit jamais — équivalent de la table paiement_suivi de Supabase.
//
// Rappel métier : ce statut interne est un SUIVI d'arbitrage (remboursements,
// attestations) ; le paiement « officiel » des étapes vient du scrap (Phase H).

import { v } from "convex/values";
import { authenticatedQuery, authenticatedMutation, authenticatedAction } from "../customFunctions";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { requireAboAdmin } from "./auth";
import { getConfigValeur } from "./config";

// Vocabulaire du suivi interne abo (sous-ensemble contrôlé de local_status).
const STATUTS = ["a_traiter", "traite", "rembourse", "en_attente"] as const;
type StatutLocal = (typeof STATUTS)[number];

// ── Parsing du lien HelloAsso (identique à helloasso.ts, isolé ici) ──
const FORM_TYPE_MAP: Record<string, string> = {
  evenements: "Event",
  adhesions: "Membership",
  collectes: "CrowdFunding",
  boutiques: "Shop",
  paiements: "PaymentForm",
};
export function parseHa(
  raw: string,
): { orgSlug: string; formType: string; formSlug: string } | null {
  try {
    const parts = new URL(raw).pathname.split("/").filter(Boolean);
    if (parts.length < 4 || parts[0] !== "associations") return null;
    const formType = FORM_TYPE_MAP[parts[2]];
    if (!formType || !parts[3]) return null;
    return { orgSlug: parts[1], formType, formSlug: parts[3] };
  } catch {
    return null;
  }
}
// Deux liens désignent le même formulaire (robuste au slash final, à la casse d'hôte).
function memeLien(a: string, b: string): boolean {
  const pa = parseHa(a);
  const pb = parseHa(b);
  return (
    pa !== null &&
    pb !== null &&
    pa.orgSlug === pb.orgSlug &&
    pa.formType === pb.formType &&
    pa.formSlug === pb.formSlug
  );
}

// Retrouve le lien helloasso_links du formulaire abo (via abo_app_config.helloasso_lien).
export async function trouverLienAbo(
  ctx: QueryCtx | MutationCtx,
): Promise<{ url: string; link: Doc<"helloasso_links"> | null } | null> {
  const url = await getConfigValeur(ctx, "helloasso_lien");
  if (!url) return null;
  const links = await ctx.db.query("helloasso_links").collect();
  const link = links.find((l) => memeLien(l.url, url)) ?? null;
  return { url, link };
}

// Un remboursement HelloAsso : ligne de transaction « Refunded » / id refund-*.
export function estRemboursement(t: Doc<"helloasso_transactions">): boolean {
  return t.helloasso_status === "Refunded" || t.helloasso_payment_id.startsWith("refund-");
}

// ── getPaiementsAbo : cache HelloAsso du formulaire abo (admin) ──────
export const getPaiementsAbo = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);

    const cible = await trouverLienAbo(ctx);
    // Non configuré, ou lien saisi mais pas encore présent dans helloasso_links.
    if (!cible) return { configured: false, adminUrl: null, paiements: [] };
    const parsed = parseHa(cible.url);
    const adminUrl = parsed
      ? `https://admin.helloasso.com/${parsed.orgSlug}/suivi-paiements`
      : cible.url;
    if (!cible.link) {
      return { configured: true, adminUrl, paiements: [] };
    }

    const dossiers = await ctx.db
      .query("dossiers")
      .withIndex("by_link", (q) => q.eq("helloasso_link_id", cible.link!._id))
      .collect();

    // Cache d'emails d'auteurs de suivi (peu d'admins distincts).
    const emailParUser = new Map<Id<"users">, string>();
    const emailAuteur = async (id: Id<"users">): Promise<string> => {
      const connu = emailParUser.get(id);
      if (connu !== undefined) return connu;
      const u = await ctx.db.get(id);
      const email = (u?.email as string | undefined) ?? "";
      emailParUser.set(id, email);
      return email;
    };

    const paiements = [];
    for (const d of dossiers) {
      const txs = await ctx.db
        .query("helloasso_transactions")
        .withIndex("by_dossier", (q) => q.eq("dossier_id", d.dossier_id))
        .collect();

      const principales = txs.filter((t) => !estRemboursement(t));
      const remb = txs.filter(estRemboursement);
      // Ligne principale = la plus ancienne (porte reçus + statut HelloAsso).
      principales.sort((a, b) => a.payment_date.localeCompare(b.payment_date));
      const ref = principales[0] ?? null;

      const remboursements = remb
        .map((r) => ({ montant: Math.abs(r.amount), date: r.payment_date }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const ha_rembourse = remboursements.length > 0;

      const statut_local = ((d.local_status as StatutLocal | undefined) ??
        "a_traiter") as StatutLocal;
      const localRembourse = statut_local === "rembourse";
      const besoin_action_remboursement =
        (localRembourse && !ha_rembourse) || (!localRembourse && ha_rembourse);

      paiements.push({
        id: d._id,
        dossier_id: d.dossier_id,
        inscrit_nom: d.last_name,
        inscrit_prenom: d.first_name,
        inscrit_email: d.email ?? null,
        payeur_nom: d.payer_last_name,
        payeur_prenom: d.payer_first_name,
        payeur_email: d.payer_email,
        montant: d.total_amount,
        date_paiement: ref?.payment_date ?? null,
        statut_helloasso: ref?.helloasso_status ?? null,
        recu_url: ref?.payment_receipt_url ?? null,
        attestation_url: ref?.fiscal_receipt_url ?? null,
        remboursements,
        ha_rembourse,
        statut_local,
        commentaire: d.comment ?? null,
        besoin_action_remboursement,
        suivi_updater_email: d.updated_by ? await emailAuteur(d.updated_by) : null,
        suivi_updated_at: d.updated_at ?? null,
      });
    }

    // Tri chronologique (comme getPaiements côté Supabase).
    paiements.sort((a, b) => (a.date_paiement ?? "").localeCompare(b.date_paiement ?? ""));
    return { configured: true, adminUrl, paiements };
  },
});

// ── setStatutPaiementAbo : suivi interne d'un paiement (admin) ───────
export const setStatutPaiementAbo = authenticatedMutation({
  args: {
    dossierId: v.id("dossiers"),
    statut: v.union(...STATUTS.map((s) => v.literal(s))),
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAboAdmin(ctx);

    const dossier = await ctx.db.get(args.dossierId);
    if (!dossier) throw new Error("Paiement introuvable.");
    // 🔒 On ne statue QUE sur les commandes du formulaire abo (pas celles des cours).
    const cible = await trouverLienAbo(ctx);
    if (!cible?.link || dossier.helloasso_link_id !== cible.link._id) {
      throw new Error("Ce paiement n'appartient pas au formulaire abonnements.");
    }

    await ctx.db.patch(args.dossierId, {
      local_status: args.statut,
      comment: args.commentaire?.trim() || undefined,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    });
    return null;
  },
});

// ── enregistrerLienAbo : lien du formulaire abo (admin) ──────────────
// Écrit abo_app_config.helloasso_lien ET s'assure qu'un helloasso_links existe
// pour que la sync partagée récupère ce formulaire. (La page Configuration de la
// Phase I réutilisera cette mutation.)
// Écrit le lien abo dans abo_app_config ET s'assure qu'un helloasso_links existe.
// Extrait pour être réutilisé par enregistrerLienAbo ET par resetSaison (config.ts).
// Le lien DOIT avoir été validé par parseHa au préalable.
export async function poserLienAbo(ctx: MutationCtx, url: string): Promise<void> {
  const cfg = await ctx.db
    .query("abo_app_config")
    .withIndex("by_cle", (q) => q.eq("cle", "helloasso_lien"))
    .first();
  const patch = { valeur: url, updated_at: new Date().toISOString() };
  if (cfg) {
    await ctx.db.patch(cfg._id, patch);
  } else {
    await ctx.db.insert("abo_app_config", { cle: "helloasso_lien", ...patch });
  }

  // helloasso_links : réutilise la ligne du formulaire abo (même org/type/slug),
  // sinon en insère une neuve — la sync partagée récupérera ce formulaire.
  const links = await ctx.db.query("helloasso_links").collect();
  const existant = links.find((l) => memeLien(l.url, url));
  if (existant) {
    if (existant.url !== url) await ctx.db.patch(existant._id, { url });
  } else {
    await ctx.db.insert("helloasso_links", {
      url,
      label: "Abonnements escalade",
      is_installment: false,
    });
  }
}

export const enregistrerLienAbo = authenticatedMutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    await requireAboAdmin(ctx);
    const url = args.url.trim();
    if (!parseHa(url)) {
      throw new Error(
        "Lien HelloAsso non reconnu (attendu : .../associations/<org>/<type>/<slug>).",
      );
    }
    await poserLienAbo(ctx, url);
    return null;
  },
});

// ── synchroniserPaiementsAbo : déclenche la sync HelloAsso (admin) ───
// Réutilise l'action partagée (qui préserve les statuts locaux). Gate rôle abo
// explicite (syncHelloAsso ne vérifie que la connexion). Phase H ajoutera le cron.
export const synchroniserPaiementsAbo = authenticatedAction({
  args: {},
  handler: async (ctx): Promise<{ synced_count: number; errors: string[] }> => {
    const me = await ctx.runQuery(api.abo.identity.me, {});
    if (!me || me.aboRole !== "admin") {
      throw new Error("Réservé aux administrateurs.");
    }
    return await ctx.runAction(api.helloasso.syncHelloAsso, {});
  },
});
