import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { consommerDemandeAboOtp } from "./aboOtp";
import { canoniserEmailUnique } from "./emailValidation";
import { consommerDemandeOtpStaff } from "./staffOtp";
import { ConvexError } from "convex/values";

const MAX_USERS_FALLBACK_EMAIL = 2_000;

function canoniserEmailSiValide(email: unknown): string | null {
  if (typeof email !== "string") return null;
  try {
    return canoniserEmailUnique(email);
  } catch {
    return null;
  }
}

async function trouverUtilisateurParEmailCanonique(
  ctx: MutationCtx,
  email: string,
) {
  const exact = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (exact) return exact;

  // Compatibilité transitoire avant exécution du backfill email : le scan ne
  // s'active qu'en l'absence d'un match indexé et reste strictement borné.
  const utilisateurs = await ctx.db.query("users").take(MAX_USERS_FALLBACK_EMAIL + 1);
  if (utilisateurs.length > MAX_USERS_FALLBACK_EMAIL) {
    throw new ConvexError({
      code: "AUTH_EMAIL_FALLBACK_VOLUME",
      message: "Connexion temporairement indisponible : migration des emails requise.",
    });
  }
  const correspondances = utilisateurs.filter(
    (user) => canoniserEmailSiValide(user.email) === email,
  );
  if (correspondances.length > 1) {
    throw new ConvexError({
      code: "AUTH_EMAIL_AMBIGU",
      message: "Plusieurs comptes correspondent à cette adresse. Contactez un administrateur.",
    });
  }
  const legacy = correspondances[0];
  if (!legacy) return null;
  await ctx.db.patch(legacy._id, { email });
  return { ...legacy, email };
}

// Génère un code OTP à 6 chiffres.
export function genererCode(): string {
  const plage = 900_000;
  const limite = Math.floor(2 ** 32 / plage) * plage;
  const tirage = new Uint32Array(1);
  do {
    crypto.getRandomValues(tirage);
  } while (tirage[0] >= limite);
  return String(100_000 + (tirage[0] % plage));
}

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
    await ctx.scheduler.runAfter(0, internal.staffOtp.dispatchEmail, {
      email: canoniserEmailUnique(email),
      code,
      shouldSend: true,
    });
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
    await ctx.scheduler.runAfter(0, internal.aboOtp.dispatchEmail, {
      email: canoniserEmailUnique(email),
      code,
    });
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GoogleOTP, AboOTP],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const emailBrut = args.profile.email;
      if (!emailBrut) {
        throw new Error("L'email est requis.");
      }
      const email = canoniserEmailUnique(emailBrut);
      // Convex Auth expose ici un GenericMutationCtx<AnyDataModel>. Le runtime
      // est bien celui de notre store et son schéma complet ; ce cast local
      // rétablit les index applicatifs sans affaiblir les requêtes en scans.
      const appCtx = ctx as MutationCtx;
      const db = appCtx.db;
      const existingUser = await trouverUtilisateurParEmailCanonique(appCtx, email);

      // Cette phase "email" s'exécute dans auth:store AVANT l'écriture du
      // nouveau code. Le quota doit être consommé ici : le faire dans
      // sendVerificationRequest ferait tourner un code qui ne serait pas envoyé.
      if (args.type === "email") {
        if (args.provider.id === "abo-otp") {
          await consommerDemandeAboOtp(appCtx, email);
        } else if (args.provider.id === "google-otp") {
          const demande = await consommerDemandeOtpStaff(
            appCtx,
            email,
            existingUser !== null,
          );
          if (!demande.autorise) throw new Error("Code incorrect ou expiré.");
        }
      }

      // --- Abonnés publics (provider abo-otp) : find-or-create sans gate ni
      // userSettings (donc aucun accès aux tuiles compta). ---
      if (args.provider.id === "abo-otp") {
        const userId = existingUser?._id ?? (await db.insert("users", { email }));

        // Profil abonné (role utilisateur) créé une seule fois. Sans effet sur
        // le rôle d'un éventuel compte staff (getAboIdentity dérive l'admin des
        // userSettings, pas d'abo_profiles).
        const profile = await db
          .query("abo_profiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .first();
        if (!profile) {
          await db.insert("abo_profiles", {
            userId,
            email,
            role: "utilisateur",
          });
        } else if (profile.email !== email) {
          await db.patch(profile._id, { email });
        }

        return userId;
      }

      // --- Staff compta (provider google-otp) : l'email doit exister. ---
      if (!existingUser) {
        throw new Error("Code incorrect ou expiré.");
      }

      return existingUser._id;
    },
  },
});
