import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { canoniserEmailUnique } from "./emailValidation";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  staffOtpRequest: {
    kind: "fixed window",
    rate: 3,
    period: 10 * MINUTE,
  },
});

async function rateLimitKey(email: string) {
  const bytes = new TextEncoder().encode(email);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function consommerDemandeOtpStaff(
  ctx: MutationCtx,
  emailBrut: string,
  autorisationConnue?: boolean,
): Promise<{ email: string; autorise: boolean }> {
  const email = canoniserEmailUnique(emailBrut);
  const status = await rateLimiter.limit(ctx, "staffOtpRequest", {
    key: await rateLimitKey(email),
  });
  if (!status.ok) {
    throw new ConvexError({
      code: "STAFF_OTP_RATE_LIMIT",
      message: "Veuillez patienter avant de demander un nouveau code.",
    });
  }
  if (autorisationConnue !== undefined) {
    return { email, autorise: autorisationConnue };
  }
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return { email, autorise: user !== null };
}

// Server-only: consume a request before checking whether it belongs to staff.
// The component key is a digest, so no raw address is stored by the limiter.
export const consumeRequest = internalMutation({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return (await consommerDemandeOtpStaff(ctx, args.email)).autorise;
  },
});

// Scheduled for every request so the client response is independent of SMTP.
// This is a one-off task, not a periodic cron.
export const dispatchEmail = internalAction({
  args: {
    email: v.string(),
    code: v.string(),
    shouldSend: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.shouldSend) {
      const email = canoniserEmailUnique(args.email);
      await ctx.runAction(internal.email.sendOTP, {
        email,
        code: args.code,
      });
    }
    return null;
  },
});
