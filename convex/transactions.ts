import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Lire toutes les transactions en résolvant les relations Tiers et Analytiques
export const get = query({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .order("desc")
      .collect();
    return await Promise.all(
      transactions.map(async (t) => {
        const tiers = await ctx.db.get(t.tiersId);
        const analytique = await ctx.db.get(t.analytiqueId);
        return {
          ...t,
          tiersNom: tiers ? tiers.nom : "Inconnu",
          analytiqueNom: analytique ? analytique.nom : "Inconnu",
          typeDocumentNom: t.typeDocumentId 
            ? ((await ctx.db.get(t.typeDocumentId))?.nom || "Inconnu")
            : (t.typeDocument || "Inconnu"),
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
    typeDocument: v.optional(v.string()),
    typeDocumentId: v.optional(v.id("typesDocuments")),
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.id("tiers"),
    analytiqueId: v.id("analytiques"),
    saison: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("transactions", {
      nom: args.nom,
      date: args.date,
      realise: args.realise,
      typeDocument: args.typeDocument,
      typeDocumentId: args.typeDocumentId,
      commentaires: args.commentaires,
      lienDrive: args.lienDrive,
      tiersId: args.tiersId,
      analytiqueId: args.analytiqueId,
      saison: args.saison,
    });
  },
});

// Modifier une transaction existante
export const update = mutation({
  args: {
    id: v.id("transactions"),
    nom: v.optional(v.string()),
    date: v.optional(v.string()),
    realise: v.optional(v.number()),
    typeDocument: v.optional(v.string()),
    typeDocumentId: v.optional(v.id("typesDocuments")),
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.optional(v.id("tiers")),
    analytiqueId: v.optional(v.id("analytiques")),
    saison: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Convex gère la mise à jour partielle avec patch
    await ctx.db.patch(id, updates);
  },
});

// Supprimer une transaction
export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
