import { mutation } from "./_generated/server";

export const migrateSaisons = mutation({
  args: {},
  handler: async (ctx) => {
    let countTrans = 0;
    const transactions = await ctx.db.query("transactions").collect();
    for (const t of transactions) {
      if (!t.saison) {
        await ctx.db.patch(t._id, { saison: "2025-26" });
        countTrans++;
      }
    }

    let countPrev = 0;
    const previsionnels = await ctx.db.query("previsionnels").collect();
    for (const p of previsionnels) {
      if (!p.saison) {
        await ctx.db.patch(p._id, { saison: "2025-26" });
        countPrev++;
      }
    }

    return { transactionsMigrated: countTrans, previsionnelsMigrated: countPrev };
  },
});
