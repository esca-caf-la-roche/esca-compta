import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

// Génère un code OTP à 6 chiffres.
const genererCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- Provider STAFF (compta) : OTP gaté sur les emails pré-enregistrés. ---
const GoogleOTP = Email({
  id: "google-otp",
  apiKey: "dummy",
  maxAge: 60 * 10, // 10 minutes
  generateVerificationToken: genererCode,
  // @ts-expect-error ctx is passed by Convex Auth but the EmailConfig type only expects 1 argument
  sendVerificationRequest: async (
    { identifier: email, token: code }: { identifier: string; token: string },
    ctx: ActionCtx,
  ) => {
    // Vérification côté serveur que l'utilisateur existe avant d'envoyer l'OTP.
    const isAllowed = await ctx.runQuery(api.users.checkEmailExists, { email });
    if (!isAllowed) {
      throw new Error("Cet email n'est pas autorisé.");
    }
    await ctx.runAction(internal.email.sendOTP, { email, code });
  },
});

// --- Provider ABONNÉS PUBLICS : OTP en auto-inscription (pas de gate), envoyé
// depuis la boîte mail du club (distincte de l'OTP compta). ---
const AboOTP = Email({
  id: "abo-otp",
  apiKey: "dummy",
  maxAge: 60 * 10, // 10 minutes
  generateVerificationToken: genererCode,
  // @ts-expect-error ctx is passed by Convex Auth but the EmailConfig type only expects 1 argument
  sendVerificationRequest: async (
    { identifier: email, token: code }: { identifier: string; token: string },
    ctx: ActionCtx,
  ) => {
    // Auto-inscription : aucun gate. Envoi via la boîte abonnements du club.
    await ctx.runAction(internal.email.sendAboEmail, {
      to: email,
      subject: `${code} : votre code de connexion — Abonnements Escalade`,
      text: `Bonjour,\n\nVotre code de connexion est : ${code}\n\nIl expire dans 10 minutes.\n\nLe club d'escalade CAF La Roche-Bonneville.`,
    });
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GoogleOTP, AboOTP],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const email = args.profile.email;
      if (!email) {
        throw new Error("L'email est requis.");
      }

      // --- Abonnés publics (provider abo-otp) : find-or-create sans gate ni
      // userSettings (donc aucun accès aux tuiles compta). ---
      if (args.provider.id === "abo-otp") {
        const existing = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("email"), email))
          .first();

        const userId = existing?._id ?? (await ctx.db.insert("users", { email }));

        // Profil abonné (role utilisateur) créé une seule fois. Sans effet sur
        // le rôle d'un éventuel compte staff (getAboIdentity dérive l'admin des
        // userSettings, pas d'abo_profiles).
        const profile = await ctx.db
          .query("abo_profiles")
          .filter((q) => q.eq(q.field("userId"), userId))
          .first();
        if (!profile) {
          await ctx.db.insert("abo_profiles", {
            userId,
            email,
            role: "utilisateur",
          });
        }

        return userId;
      }

      // --- Staff compta (provider google-otp) : l'email doit exister. ---
      const existingUser = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), email))
        .first();

      if (!existingUser) {
        throw new Error(
          "Cet email n'est pas autorisé. Veuillez contacter un administrateur.",
        );
      }

      return existingUser._id;
    },
  },
});
