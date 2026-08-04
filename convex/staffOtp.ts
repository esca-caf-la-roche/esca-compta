import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  staffOtpRequest: {
    kind: "fixed window",
    rate: 3,
    period: 10 * MINUTE,
  },
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function rateLimitKey(email: string) {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

// Server-only: consume a request before checking whether it belongs to staff.
// The component key is a digest, so no raw address is stored by the limiter.
export const consumeRequest = internalMutation({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const status = await rateLimiter.limit(ctx, "staffOtpRequest", {
      key: await rateLimitKey(args.email),
    });
    if (!status.ok) {
      throw new Error("Veuillez patienter avant de demander un nouveau code.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizeEmail(args.email)))
      .first();
    return user !== null;
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
      await ctx.runAction(internal.email.sendOTP, {
        email: args.email,
        code: args.code,
      });
    }
    return null;
  },
});
