import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
