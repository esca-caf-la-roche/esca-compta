import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";
import { requireTile } from "./access";

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "compta");
    const types = await ctx.db.query("typesDocuments").collect();
    return types.sort((a, b) => a.nom.localeCompare(b.nom));
  },
});

export const create = mutation({
  args: { nom: v.string() },
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "compta");
    return await ctx.db.insert("typesDocuments", { nom: args.nom });
  },
});
