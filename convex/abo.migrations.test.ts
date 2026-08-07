/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { normaliserAboAbonnementValide } from "./migrations";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("migrations des statuts Abonnements", () => {
  test("convertit les booléens historiques sans inventer la valeur de false", () => {
    expect(normaliserAboAbonnementValide(true)).toBe("oui");
    expect(normaliserAboAbonnementValide(false)).toBe("inconnu");
  });

  test.each(["oui", "non", "bloque", "inconnu"] as const)(
    "laisse le statut %s inchangé et reste idempotente",
    (statut) => {
      const premierPassage = normaliserAboAbonnementValide(statut);
      expect(premierPassage).toBe(statut);
      expect(normaliserAboAbonnementValide(premierPassage)).toBe(statut);
    },
  );

  test("le schéma widen accepte simultanément les booléens et les statuts explicites", async () => {
    const t = convexTest(schema, modules);
    const statuts = [true, false, "oui", "non", "bloque", "inconnu"] as const;

    await t.run(async (ctx) => {
      for (const [index, abonnement_valide] of statuts.entries()) {
        const nom_prenom_normalise = `migration test ${index}`;
        await ctx.db.insert("abo_abonnes_scrap", {
          nom_prenom_normalise,
          abonnement_valide,
        });
        await ctx.db.insert("abo_abonnes_archive", {
          nom_prenom_normalise,
          abonnement_valide,
          saison: "2025-26",
        });
      }
    });

    const totaux = await t.run(async (ctx) => ({
      scrap: (await ctx.db.query("abo_abonnes_scrap").collect()).length,
      archive: (await ctx.db.query("abo_abonnes_archive").collect()).length,
    }));
    expect(totaux).toEqual({ scrap: statuts.length, archive: statuts.length });
  });
});
