import { authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";

export const create = mutation({
  args: { nom: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tiers", {
      nom: args.nom,
    });
  },
});
