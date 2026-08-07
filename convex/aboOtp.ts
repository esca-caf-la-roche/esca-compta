import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { canoniserEmailUnique } from "./emailValidation";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  aboOtpParEmail: {
    kind: "fixed window",
    rate: 3,
    period: 10 * MINUTE,
  },
  aboOtpGlobal: {
    kind: "fixed window",
    rate: 60,
    period: MINUTE,
  },
});

async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function consommerDemandeAboOtp(
  ctx: MutationCtx,
  emailBrut: string,
): Promise<string> {
  const email = canoniserEmailUnique(emailBrut);
  const global = await rateLimiter.limit(ctx, "aboOtpGlobal", { key: "global" });
  const individuel = await rateLimiter.limit(ctx, "aboOtpParEmail", {
    key: await hashEmail(email),
  });
  if (!global.ok || !individuel.ok) {
    throw new ConvexError({
      code: "ABO_OTP_RATE_LIMIT",
      message: "Veuillez patienter avant de demander un nouveau code.",
    });
  }
  return email;
}

export const consumeRequest = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await consommerDemandeAboOtp(ctx, args.email);
    return null;
  },
});

// L'envoi est planifié afin que la requête d'authentification ne dépende pas
// du temps de réponse SMTP. Aucun email brut n'est stocké dans le rate limiter.
export const dispatchEmail = internalAction({
  args: { email: v.string(), code: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = canoniserEmailUnique(args.email);
    await ctx.runAction(internal.email.sendAboEmail, {
      to: email,
      subject: `${args.code} : votre code de connexion — Abonnements Escalade`,
      text: `Bonjour,\n\nVotre code de connexion est : ${args.code}\n\nIl expire dans 10 minutes.\n\nLe club d'escalade CAF La Roche-Bonneville.`,
    });
    return null;
  },
});
