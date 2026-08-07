/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { migrerEmailUtilisateurCanonique } from "./migrations";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("migration des emails utilisateurs", () => {
  test("normalise un email valide lorsqu'il n'est pas occupé", async () => {
    const t = convexTest(schema, modules);

    const resultat = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "  Alice.Exemple@Example.TEST  ",
      });
      const utilisateur = await ctx.db.get("users", userId);
      if (!utilisateur) throw new Error("Utilisateur de test introuvable");

      const statut = await migrerEmailUtilisateurCanonique(ctx, utilisateur);
      return {
        statut,
        email: (await ctx.db.get("users", userId))?.email,
      };
    });

    expect(resultat).toEqual({
      statut: "normalise",
      email: "alice.exemple@example.test",
    });
  });

  test("reste idempotente après la première normalisation", async () => {
    const t = convexTest(schema, modules);

    const resultat = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "Alice@Example.TEST",
      });
      const avant = await ctx.db.get("users", userId);
      if (!avant) throw new Error("Utilisateur de test introuvable");
      const premier = await migrerEmailUtilisateurCanonique(ctx, avant);

      const apres = await ctx.db.get("users", userId);
      if (!apres) throw new Error("Utilisateur de test introuvable");
      const second = await migrerEmailUtilisateurCanonique(ctx, apres);
      return { premier, second, email: apres.email };
    });

    expect(resultat).toEqual({
      premier: "normalise",
      second: "canonique",
      email: "alice@example.test",
    });
  });

  test("conserve le doublon en casse différente pour arbitrage", async () => {
    const t = convexTest(schema, modules);

    const resultat = await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "doublon@example.test" });
      const userId = await ctx.db.insert("users", {
        email: "DOUBLON@EXAMPLE.TEST",
      });
      const utilisateur = await ctx.db.get("users", userId);
      if (!utilisateur) throw new Error("Utilisateur de test introuvable");

      const statut = await migrerEmailUtilisateurCanonique(ctx, utilisateur);
      const utilisateurs = await ctx.db.query("users").collect();
      return {
        statut,
        emails: utilisateurs.map((user) => user.email).sort(),
      };
    });

    expect(resultat).toEqual({
      statut: "conflit",
      emails: ["DOUBLON@EXAMPLE.TEST", "doublon@example.test"],
    });
  });

  test("conserve deux formes legacy équivalentes sans choisir la première", async () => {
    const t = convexTest(schema, modules);

    const resultat = await t.run(async (ctx) => {
      const premierId = await ctx.db.insert("users", {
        email: " Alice@Example.TEST ",
      });
      const secondId = await ctx.db.insert("users", {
        email: "ALICE@EXAMPLE.TEST",
      });
      const premier = await ctx.db.get("users", premierId);
      const second = await ctx.db.get("users", secondId);
      if (!premier || !second) {
        throw new Error("Utilisateurs de test introuvables");
      }

      const premierStatut = await migrerEmailUtilisateurCanonique(ctx, premier);
      const secondStatut = await migrerEmailUtilisateurCanonique(ctx, second);
      return {
        statuts: [premierStatut, secondStatut],
        emails: (await ctx.db.query("users").collect())
          .map((user) => user.email)
          .sort(),
      };
    });

    expect(resultat).toEqual({
      statuts: ["conflit", "conflit"],
      emails: [" Alice@Example.TEST ", "ALICE@EXAMPLE.TEST"],
    });
  });

  test("conserve un format invalide sans le corriger ni le supprimer", async () => {
    const t = convexTest(schema, modules);

    const resultat = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "deux@example.test,autre@example.test",
      });
      const utilisateur = await ctx.db.get("users", userId);
      if (!utilisateur) throw new Error("Utilisateur de test introuvable");

      const statut = await migrerEmailUtilisateurCanonique(ctx, utilisateur);
      return {
        statut,
        email: (await ctx.db.get("users", userId))?.email,
      };
    });

    expect(resultat).toEqual({
      statut: "invalide",
      email: "deux@example.test,autre@example.test",
    });
  });

  test("l'inspection classe une page entière avec des compteurs non nominatifs", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "canonique@example.test" });
      await ctx.db.insert("users", { email: "CANONIQUE@EXAMPLE.TEST" });
      await ctx.db.insert("users", { email: "A-NORMALISER@EXAMPLE.TEST" });
      await ctx.db.insert("users", { email: "invalide" });
      await ctx.db.insert("users", {});
    });

    const inspection = await t.query(
      internal.migrations.inspectUsersEmailCanonique,
      { paginationOpts: { cursor: null, numItems: 10 } },
    );

    expect(inspection).toMatchObject({
      lus: 5,
      sans_email: 1,
      canonique: 0,
      a_normaliser: 1,
      invalide: 1,
      conflit: 2,
      isDone: true,
    });
    expect(JSON.stringify(inspection)).not.toContain("example.test");
  });
});
