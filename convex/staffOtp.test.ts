/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

describe("demande OTP staff", () => {
  test("traite une adresse staff et inconnue sans exposer le résultat au client", async () => {
    const t = createTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "staff@example.test" });
    });

    await expect(
      t.mutation(internal.staffOtp.consumeRequest, {
        email: "staff@example.test",
      }),
    ).resolves.toBe(true);
    await expect(
      t.mutation(internal.staffOtp.consumeRequest, {
        email: "inconnu@example.test",
      }),
    ).resolves.toBe(false);
  });

  test("refuse la quatrième demande par adresse dans la fenêtre", async () => {
    const t = createTest();
    const args = { email: "inconnu@example.test" };

    await t.mutation(internal.staffOtp.consumeRequest, args);
    await t.mutation(internal.staffOtp.consumeRequest, args);
    await t.mutation(internal.staffOtp.consumeRequest, args);
    await expect(
      t.mutation(internal.staffOtp.consumeRequest, args),
    ).rejects.toThrow("Veuillez patienter");
  });

  test("bloque avant de remplacer le code staff stocké", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.test");
    try {
      const t = createTest();
      await t.run(async (ctx) => {
        await ctx.db.insert("users", { email: "rotation-staff@example.test" });
      });
      const args = {
        provider: "google-otp",
        params: { email: "rotation-staff@example.test" },
      };
      await t.action(api.auth.signIn, args);
      await t.action(api.auth.signIn, args);
      await t.action(api.auth.signIn, args);
      const avant = await t.run(async (ctx) =>
        await ctx.db.query("authVerificationCodes").first(),
      );
      await expect(t.action(api.auth.signIn, args)).rejects.toThrow("Veuillez patienter");
      const apres = await t.run(async (ctx) =>
        await ctx.db.query("authVerificationCodes").first(),
      );
      expect(apres?._id).toBe(avant?._id);
      expect(apres?.code).toBe(avant?.code);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("autorise et canonise un compte staff legacy avant le backfill", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.test");
    try {
      const t = createTest();
      const userId = await t.run(async (ctx) =>
        await ctx.db.insert("users", { email: " Legacy.Staff@Example.TEST " }),
      );
      await expect(t.action(api.auth.signIn, {
        provider: "google-otp",
        params: { email: "legacy.staff@example.test" },
      })).resolves.toBeDefined();
      const user = await t.run(async (ctx) => await ctx.db.get(userId));
      expect(user?.email).toBe("legacy.staff@example.test");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
