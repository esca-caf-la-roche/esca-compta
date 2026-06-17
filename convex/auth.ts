import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const sendOTP = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // 1. Vérifier si l'utilisateur existe
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      throw new Error("Cet email n'est pas autorisé. Le compte doit être créé dans l'interface Convex.");
    }

    // 2. Générer un code à 6 chiffres
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // 3. Stocker l'OTP (supprimer les anciens d'abord)
    const existingOTPs = await ctx.db
      .query("otps")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect();
    for (const otp of existingOTPs) {
      await ctx.db.delete(otp._id);
    }

    await ctx.db.insert("otps", {
      email: args.email,
      code,
      expiresAt,
    });

    // 4. Simuler l'envoi du code. Pour l'instant, on l'affiche dans les logs Convex.
    console.log(`[OTP] Code pour ${args.email} : ${code}`);
    return { success: true };
  },
});

export const verifyOTP = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const otpRecord = await ctx.db
      .query("otps")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!otpRecord) throw new Error("Aucun code OTP trouvé.");
    if (otpRecord.code !== args.code) throw new Error("Code OTP incorrect.");
    if (Date.now() > otpRecord.expiresAt) throw new Error("Le code OTP a expiré.");

    // L'OTP est valide, on le supprime
    await ctx.db.delete(otpRecord._id);

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) throw new Error("Utilisateur introuvable.");

    return { token: user._id, user }; 
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
