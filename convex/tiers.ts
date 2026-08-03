import { authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";
import { requireTile } from "./access";

export const create = mutation({
  args: { nom: v.string() },
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "compta");
    return await ctx.db.insert("tiers", {
      nom: args.nom,
    });
  },
});
