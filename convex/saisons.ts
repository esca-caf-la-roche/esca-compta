import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";
import { nextSaison } from "./saisonUtils";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

async function requireAdmin(ctx: MutationCtx, userId: Id<"users">) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (settings?.role !== "admin") {
    throw new Error("Seul un administrateur peut effectuer cette action.");
  }
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const saisons = await ctx.db.query("saisons").collect();
    return saisons.sort((a, b) => b.nom.localeCompare(a.nom)); // Tri décroissant: plus récent en premier
  },
});

export const create = mutation({
  args: { nom: v.string(), isDefault: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const isDefault = args.isDefault ?? false;
    
    if (isDefault) {
      // Retirer le default des autres
      const all = await ctx.db.query("saisons").collect();
      for (const s of all) {
        if (s.isDefault) {
          await ctx.db.patch(s._id, { isDefault: false });
        }
      }
    }
    
    return await ctx.db.insert("saisons", { nom: args.nom, isDefault });
  },
});

// Ajoute la saison suivante (séquentielle) et reprend les données de la
// saison la plus récente : paramètres de paie + lignes de salaire (les
// montants sont copiés tels quels, l'admin ajuste ensuite l'augmentation).
export const createNext = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, ctx.userId);

    const all = await ctx.db.query("saisons").collect();
    if (all.length === 0) {
      throw new Error("Aucune saison existante : créez une première saison manuellement.");
    }
    // La plus récente au format "YYYY-YY".
    const latest = all
      .map((s) => s.nom)
      .filter((n) => /^\d{4}-\d{2}$/.test(n))
      .sort((a, b) => b.localeCompare(a))[0];
    if (!latest) {
      throw new Error("Format de saison non reconnu (attendu : AAAA-AA).");
    }
    const suivante = nextSaison(latest);
    if (!suivante) {
      throw new Error("Impossible de calculer la saison suivante.");
    }
    if (all.some((s) => s.nom === suivante)) {
      throw new Error(`La saison ${suivante} existe déjà.`);
    }

    const newId = await ctx.db.insert("saisons", { nom: suivante, isDefault: false });

    // Reprise des paramètres de paie de la saison précédente.
    const prevParams = await ctx.db
      .query("parametresPaie")
      .withIndex("by_saison", (q) => q.eq("saison", latest))
      .first();
    if (prevParams) {
      const { _id, _creationTime, saison, ...rest } = prevParams;
      await ctx.db.insert("parametresPaie", { saison: suivante, ...rest });
    }

    // Reprise des lignes de salaire (mêmes moniteurs, mêmes montants).
    const prevLignes = await ctx.db
      .query("salairesSaison")
      .withIndex("by_saison", (q) => q.eq("saison", latest))
      .collect();
    for (const l of prevLignes) {
      await ctx.db.insert("salairesSaison", {
        salarieId: l.salarieId,
        saison: suivante,
        nbHeuresAnnuel: l.nbHeuresAnnuel,
        nbMois: l.nbMois,
        tauxHoraireBrut: l.tauxHoraireBrut,
        augmentationPct: 0,
        actif: l.actif ?? true,
      });
    }

    return { id: newId, nom: suivante, lignesReprises: prevLignes.length };
  },
});

export const update = mutation({
  args: { id: v.id("saisons"), isDefault: v.boolean() },
  handler: async (ctx, args) => {
    if (args.isDefault) {
      const all = await ctx.db.query("saisons").collect();
      for (const s of all) {
        if (s.isDefault && s._id !== args.id) {
          await ctx.db.patch(s._id, { isDefault: false });
        }
      }
    }
    await ctx.db.patch(args.id, { isDefault: args.isDefault });
  },
});

export const remove = mutation({
  args: { id: v.id("saisons") },
  handler: async (ctx, args) => {
    // Vérification de sécurité: ne pas supprimer si utilisé ?
    // Dans Convex, il n'y a pas de contrainte de clé étrangère automatique, 
    // mais on peut faire une recherche dans les transactions et prévisionnels
    const saison = await ctx.db.get(args.id);
    if (!saison) throw new Error("Saison introuvable");

    const usedInTx = await ctx.db.query("transactions").withIndex("by_saison", q => q.eq("saison", saison.nom)).first();
    const usedInPrev = await ctx.db.query("previsionnels").withIndex("by_saison", q => q.eq("saison", saison.nom)).first();

    if (usedInTx || usedInPrev) {
      throw new Error("Cette saison contient des données et ne peut pas être supprimée.");
    }

    if (saison.isDefault) {
      throw new Error("Impossible de supprimer la saison par défaut. Définissez une autre saison par défaut d'abord.");
    }

    await ctx.db.delete(args.id);
  },
});
