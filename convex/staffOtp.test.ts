/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
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
});
