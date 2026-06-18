import { query } from "./_generated/server";

export const getTiers = query({
  args: {},
  handler: async (ctx) => {
    const tiers = await ctx.db.query("tiers").collect();
    // Trie alphabétique
    return tiers.sort((a, b) => a.nom.localeCompare(b.nom));
  },
});

export const getAnalytiques = query({
  args: {},
  handler: async (ctx) => {
    const analytiques = await ctx.db.query("analytiques").collect();
    // Trie alphabétique
    return analytiques.sort((a, b) => a.nom.localeCompare(b.nom));
  },
});
