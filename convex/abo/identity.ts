import { query } from "../_generated/server";
import { getAboIdentity } from "./auth";

// Flags d'accès (grossiers) de l'appelant, pour l'aiguillage du front :
//   - null                → non connecté
//   - { isStaff:false }   → abonné public (aucun accès compta → cantonné à /abonnements)
//   - { isStaff:true, aboRole } → compte staff (aboRole="admin" s'il gère les abonnements)
// Ne renvoie que les infos du caller lui-même : sans risque de fuite.
// PUBLIC: renvoie null si non connecté (sert à l'aiguillage avant login).
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAboIdentity(ctx);
    if (!identity) return null;

    // isStaff = possède un userSettings (tout compte créé par un admin en a un).
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", identity.userId))
      .first();

    return {
      isStaff: settings !== null,
      aboRole: identity.aboRole,
      email: identity.email,
    };
  },
});
