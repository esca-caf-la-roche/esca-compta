import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const previsionnels = await ctx.db.query("previsionnels").collect();
    
    // Jointure manuelle avec analytiques
    return Promise.all(
      previsionnels.map(async (prev) => {
        let analytiqueNom = "Inconnu";
        if (prev.analytiqueId) {
          const ana = await ctx.db.get(prev.analytiqueId);
          if (ana) analytiqueNom = ana.nom;
        }
        return {
          ...prev,
          analytiqueNom,
        };
      })
    );
  },
});

export const add = mutation({
  args: {
    nom: v.string(),
    montant: v.number(),
    etat: v.boolean(),
    analytiqueId: v.id("analytiques"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("previsionnels", {
      nom: args.nom,
      montant: args.montant,
      etat: args.etat,
      analytiqueId: args.analytiqueId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("previsionnels"),
    nom: v.optional(v.string()),
    montant: v.optional(v.number()),
    etat: v.optional(v.boolean()),
    analytiqueId: v.optional(v.id("analytiques")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("previsionnels") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
