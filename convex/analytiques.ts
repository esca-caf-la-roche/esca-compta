import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("analytiques").collect();
  },
});

export const add = mutation({
  args: {
    nom: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("analytiques", {
      nom: args.nom,
      description: args.description,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("analytiques"),
    nom: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("analytiques") },
  handler: async (ctx, args) => {
    // Vérifier si des prévisionnels ou des transactions sont liés ?
    // Pour l'instant on autorise la suppression directe.
    await ctx.db.delete(args.id);
  },
});
