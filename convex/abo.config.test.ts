/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("purge annuelle des comptes Abonnements", () => {
  test("conserve le compte et les droits d'un demandeur également staff", async () => {
    const t = convexTest(schema, modules);
    const { publicUserId, staffAccountId, staffSessionId, staffUserId } = await t.run(async (ctx) => {
      const publicUserId = await ctx.db.insert("users", {
        email: "public@example.test",
      });
      await ctx.db.insert("abo_profiles", {
        userId: publicUserId,
        email: "public@example.test",
        role: "utilisateur",
      });

      const staffUserId = await ctx.db.insert("users", {
        email: "staff-demandeur@example.test",
      });
      await ctx.db.insert("userSettings", {
        userId: staffUserId,
        allowedTiles: ["abonnements"],
        role: "admin",
      });
      await ctx.db.insert("abo_profiles", {
        userId: staffUserId,
        email: "staff-demandeur@example.test",
        role: "utilisateur",
      });
      const staffSessionId = await ctx.db.insert("authSessions", {
        userId: staffUserId,
        expirationTime: Date.now() + 60_000,
      });
      const staffAccountId = await ctx.db.insert("authAccounts", {
        userId: staffUserId,
        provider: "google-otp",
        providerAccountId: "staff-demandeur@example.test",
      });
      return { publicUserId, staffAccountId, staffSessionId, staffUserId };
    });

    await t.mutation(internal.abo.config.purgerComptesPublics, {});

    const state = await t.run(async (ctx) => ({
      publicUser: await ctx.db.get(publicUserId),
      staffUser: await ctx.db.get(staffUserId),
      staffSession: await ctx.db.get(staffSessionId),
      staffAccount: await ctx.db.get(staffAccountId),
      staffSettings: await ctx.db
        .query("userSettings")
        .withIndex("by_userId", (q) => q.eq("userId", staffUserId))
        .first(),
      staffProfile: await ctx.db
        .query("abo_profiles")
        .withIndex("by_userId", (q) => q.eq("userId", staffUserId))
        .first(),
    }));

    expect(state.publicUser).toBeNull();
    expect(state.staffUser).toMatchObject({ email: "staff-demandeur@example.test" });
    expect(state.staffSession).not.toBeNull();
    expect(state.staffAccount).toMatchObject({ provider: "google-otp" });
    expect(state.staffSettings).toMatchObject({
      allowedTiles: ["abonnements"],
      role: "admin",
    });
    expect(state.staffProfile).toBeNull();
  });
});
