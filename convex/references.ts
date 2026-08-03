import { authenticatedQuery as query } from "./customFunctions";
import { requireTile } from "./access";

export const getTiers = query({
  args: {},
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "compta");
    const tiers = await ctx.db.query("tiers").collect();
    // Trie alphabétique
    return tiers.sort((a, b) => a.nom.localeCompare(b.nom));
  },
});

export const getAnalytiques = query({
  args: {},
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "compta");
    const analytiques = await ctx.db.query("analytiques").collect();
    // Trie alphabétique
    return analytiques.sort((a, b) => a.nom.localeCompare(b.nom));
  },
});
