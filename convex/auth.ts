import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { api, internal } from "./_generated/api";
import { ActionCtx } from "./_generated/server";

const GoogleOTP = Email({
  id: "google-otp",
  apiKey: "dummy", 
  maxAge: 60 * 10, // 10 minutes
  generateVerificationToken: () => {
    // Code OTP à 6 chiffres
    return Math.floor(100000 + Math.random() * 900000).toString();
  },
  // @ts-expect-error ctx is passed by Convex Auth but the EmailConfig type only expects 1 argument
  sendVerificationRequest: async (
    { identifier: email, token: code }: { identifier: string; token: string },
    ctx: ActionCtx,
  ) => {
    // Vérification côté serveur que l'utilisateur existe dans la base de données avant d'envoyer l'OTP
    const isAllowed = await ctx.runQuery(api.users.checkEmailExists, { email });
    if (!isAllowed) {
      throw new Error("Cet email n'est pas autorisé.");
    }
    // On appelle une action Node.js car auth.ts s'exécute dans V8
    await ctx.runAction(internal.email.sendOTP, { email, code });
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GoogleOTP],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const email = args.profile.email as string | undefined;
      if (!email) {
        throw new Error("L'email est requis.");
      }
      
      const existingUser = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), email))
        .first();

      if (!existingUser) {
        throw new Error("Cet email n'est pas autorisé. Veuillez contacter un administrateur.");
      }

      return existingUser._id;
    }
  }
});
