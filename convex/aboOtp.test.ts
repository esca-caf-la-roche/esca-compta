/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { genererCode } from "./auth";

const modules = import.meta.glob("./**/*.ts");

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

describe("demande OTP abonnements", () => {
  test("autorise trois demandes puis refuse la quatrième pour une même adresse", async () => {
    const t = createTest();
    const args = { email: "Public@Example.Test" };
    await t.mutation(internal.aboOtp.consumeRequest, args);
    await t.mutation(internal.aboOtp.consumeRequest, args);
    await t.mutation(internal.aboOtp.consumeRequest, args);
    await expect(t.mutation(internal.aboOtp.consumeRequest, args)).rejects.toThrow(
      "Veuillez patienter",
    );
  });

  test("normalise la casse avant d'appliquer la limite par adresse", async () => {
    const t = createTest();
    await t.mutation(internal.aboOtp.consumeRequest, { email: "case@example.test" });
    await t.mutation(internal.aboOtp.consumeRequest, { email: "CASE@example.test" });
    await t.mutation(internal.aboOtp.consumeRequest, { email: " Case@Example.Test " });
    await expect(
      t.mutation(internal.aboOtp.consumeRequest, { email: "case@example.test" }),
    ).rejects.toThrow("Veuillez patienter");
  });

  test("applique aussi un plafond global aux adresses distinctes", async () => {
    const t = createTest();
    for (let i = 0; i < 60; i++) {
      await t.mutation(internal.aboOtp.consumeRequest, {
        email: `public-${i}@example.test`,
      });
    }
    await expect(t.mutation(internal.aboOtp.consumeRequest, {
      email: "public-61@example.test",
    })).rejects.toThrow("Veuillez patienter");
  });

  test.each([
    "a@example.test,b@example.test",
    "a@example.test;b@example.test",
    "a@example.test\r\nBcc: b@example.test",
    "Alice <alice@example.test>",
    "alice@example.test autre@example.test",
  ])("refuse un destinataire non unique avant de consommer le quota: %s", async (email) => {
    const t = createTest();
    await expect(t.mutation(internal.aboOtp.consumeRequest, { email })).rejects.toThrow(
      "Adresse email invalide",
    );
    // Trois demandes valides restent disponibles : l'entrée invalide n'a pas
    // consommé le quota individuel de l'adresse canonique.
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.aboOtp.consumeRequest, { email: "alice@example.test" });
    }
  });

  test("génère un code à six chiffres sans utiliser Math.random", () => {
    const aleatoireFaible = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random ne doit pas être appelé");
    });
    try {
      for (let i = 0; i < 100; i++) expect(genererCode()).toMatch(/^\d{6}$/);
    } finally {
      aleatoireFaible.mockRestore();
    }
  });

  test("un quota dépassé ne remplace pas le code de vérification stocké", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.test");
    try {
      const t = createTest();
      const args = { provider: "abo-otp", params: { email: "rotation@example.test" } };
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

  test("rejette un multi-destinataire avant toute création de code", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.test");
    try {
      const t = createTest();
      await expect(t.action(api.auth.signIn, {
        provider: "abo-otp",
        params: { email: "a@example.test,b@example.test" },
      })).rejects.toThrow("Adresse email invalide");
      const code = await t.run(async (ctx) =>
        await ctx.db.query("authVerificationCodes").first(),
      );
      expect(code).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("réutilise et canonise un compte public legacy avant le backfill", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.test");
    try {
      const t = createTest();
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("users", { email: " Legacy.Public@Example.TEST " });
        await ctx.db.insert("abo_profiles", {
          userId: id,
          email: " Legacy.Public@Example.TEST ",
          role: "utilisateur",
        });
        return id;
      });
      await t.action(api.auth.signIn, {
        provider: "abo-otp",
        params: { email: "legacy.public@example.test" },
      });
      const etat = await t.run(async (ctx) => ({
        users: await ctx.db.query("users").collect(),
        user: await ctx.db.get(userId),
        profile: await ctx.db
          .query("abo_profiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique(),
      }));
      expect(etat.users).toHaveLength(1);
      expect(etat.user?.email).toBe("legacy.public@example.test");
      expect(etat.profile?.email).toBe("legacy.public@example.test");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("refuse une collision ambiguë entre comptes legacy", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.test");
    try {
      const t = createTest();
      await t.run(async (ctx) => {
        await ctx.db.insert("users", { email: " Collision@Example.TEST " });
        await ctx.db.insert("users", { email: "collision@EXAMPLE.test" });
      });
      await expect(t.action(api.auth.signIn, {
        provider: "abo-otp",
        params: { email: "collision@example.test" },
      })).rejects.toThrow("Plusieurs comptes correspondent");
      const code = await t.run(async (ctx) =>
        await ctx.db.query("authVerificationCodes").first(),
      );
      expect(code).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
