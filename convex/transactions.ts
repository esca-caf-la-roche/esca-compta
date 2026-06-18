import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Lire toutes les transactions en résolvant les relations Tiers et Analytiques
export const get = query({
  args: {},
  handler: async (ctx) => {
    const transactions = await ctx.db.query("transactions").order("desc").collect();
    return await Promise.all(
      transactions.map(async (t) => {
        const tiers = await ctx.db.get(t.tiersId);
        const analytique = await ctx.db.get(t.analytiqueId);
        return {
          ...t,
          tiersNom: tiers ? tiers.nom : "Inconnu",
          analytiqueNom: analytique ? analytique.nom : "Inconnu",
        };
      })
    );
  },
});

// Ajouter une nouvelle transaction
export const create = mutation({
  args: {
    nom: v.string(),
    date: v.string(),
    realise: v.number(),
    typeDocument: v.string(),
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.id("tiers"),
    analytiqueId: v.id("analytiques"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("transactions", {
      nom: args.nom,
      date: args.date,
      realise: args.realise,
      typeDocument: args.typeDocument,
      commentaires: args.commentaires,
      lienDrive: args.lienDrive,
      tiersId: args.tiersId,
      analytiqueId: args.analytiqueId,
    });
  },
});
