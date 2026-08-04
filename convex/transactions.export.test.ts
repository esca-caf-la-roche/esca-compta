/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const paginationOpts = { cursor: null, numItems: 2 };

async function createStaff(t: ReturnType<typeof convexTest>, allowedTiles: string[]) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: `export-${allowedTiles.join("-") || "none"}@example.test`,
    });
    await ctx.db.insert("userSettings", { userId, allowedTiles, role: "user" });
    return userId;
  });
}

async function insertTransaction(
  t: ReturnType<typeof convexTest>,
  values: {
    nom: string;
    tiersId: Id<"tiers">;
    analytiqueId: Id<"analytiques">;
    typeDocumentId?: Id<"typesDocuments">;
    typeDocument?: string;
    commentaires?: string;
  },
) {
  return await t.run((ctx) =>
    ctx.db.insert("transactions", {
      ...values,
      date: "2026-08-04",
      realise: 10,
      saison: "2026-2027",
    }),
  );
}

describe("transactions.getExportPage", () => {
  test("met à jour chaque liste de filtres selon le filtre opposé", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, ["compta"]);
    const staff = t.withIdentity({ subject: userId });
    const { tiersA, tiersB, analytiqueA, analytiqueB } = await t.run(async (ctx) => ({
      tiersA: await ctx.db.insert("tiers", { nom: "Tiers A" }),
      tiersB: await ctx.db.insert("tiers", { nom: "Tiers B" }),
      analytiqueA: await ctx.db.insert("analytiques", { nom: "Analytique A" }),
      analytiqueB: await ctx.db.insert("analytiques", { nom: "Analytique B" }),
    }));

    await insertTransaction(t, { nom: "A-A", tiersId: tiersA, analytiqueId: analytiqueA });
    await insertTransaction(t, { nom: "B-A", tiersId: tiersB, analytiqueId: analytiqueA });
    await insertTransaction(t, { nom: "A-B", tiersId: tiersA, analytiqueId: analytiqueB });

    const byAnalytique = await staff.query(api.transactions.getStats, {
      saison: "2026-2027",
      filterAnalytiqueId: analytiqueA,
    });
    expect(byAnalytique.uniqueTiers.map((tiers) => tiers.id).sort()).toEqual(
      [tiersA, tiersB].sort(),
    );

    const byTiers = await staff.query(api.transactions.getStats, {
      saison: "2026-2027",
      filterTiersId: tiersA,
    });
    expect(byTiers.uniqueAnalytiques.map((analytique) => analytique.id).sort()).toEqual(
      [analytiqueA, analytiqueB].sort(),
    );
  });

  test("retourne des pages dans l'ordre décroissant et hydrate les relations", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, ["compta"]);
    const staff = t.withIdentity({ subject: userId });
    const { tiersId, analytiqueId, typeId } = await t.run(async (ctx) => {
      const tiersId = await ctx.db.insert("tiers", { nom: "Fournisseur" });
      const analytiqueId = await ctx.db.insert("analytiques", { nom: "Matériel" });
      const typeId = await ctx.db.insert("typesDocuments", { nom: "Facture" });
      return { tiersId, analytiqueId, typeId };
    });

    await insertTransaction(t, { nom: "Premier", tiersId, analytiqueId });
    await insertTransaction(t, {
      nom: "Deuxième",
      tiersId,
      analytiqueId,
      typeDocumentId: typeId,
    });
    await insertTransaction(t, { nom: "Troisième", tiersId, analytiqueId, typeDocument: "Reçu" });

    const firstPage = await staff.query(api.transactions.getExportPage, {
      saison: "2026-2027",
      paginationOpts,
    });
    expect(firstPage.page.map((transaction) => transaction.nom)).toEqual([
      "Troisième",
      "Deuxième",
    ]);
    expect(firstPage.page[0]).toMatchObject({
      tiersNom: "Fournisseur",
      analytiqueNom: "Matériel",
      typeDocumentNom: "Reçu",
    });
    expect(firstPage.page[1].typeDocumentNom).toBe("Facture");
    expect(firstPage.isDone).toBe(false);

    const secondPage = await staff.query(api.transactions.getExportPage, {
      saison: "2026-2027",
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 2 },
    });
    expect(secondPage.page.map((transaction) => transaction.nom)).toEqual(["Premier"]);
    expect(secondPage.isDone).toBe(true);
  });

  test("conserve les filtres et la recherche insensible aux accents et à la casse", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, ["compta"]);
    const staff = t.withIdentity({ subject: userId });
    const { fournisseurId, autreTiersId, materielId, autreAnalytiqueId } = await t.run(
      async (ctx) => ({
        fournisseurId: await ctx.db.insert("tiers", { nom: "Fournisseur" }),
        autreTiersId: await ctx.db.insert("tiers", { nom: "Autre" }),
        materielId: await ctx.db.insert("analytiques", { nom: "Matériel" }),
        autreAnalytiqueId: await ctx.db.insert("analytiques", { nom: "Autre analytique" }),
      }),
    );

    await insertTransaction(t, {
      nom: "Réparation corde",
      tiersId: fournisseurId,
      analytiqueId: materielId,
    });
    await insertTransaction(t, {
      nom: "Sans commentaire",
      tiersId: fournisseurId,
      analytiqueId: materielId,
    });
    await insertTransaction(t, {
      nom: "Réparation hors filtre",
      tiersId: autreTiersId,
      analytiqueId: autreAnalytiqueId,
    });

    const result = await staff.query(api.transactions.getExportPage, {
      saison: "2026-2027",
      paginationOpts: { cursor: null, numItems: 10 },
      filterTiersId: fournisseurId,
      filterAnalytiqueId: materielId,
      searchQuery: "REPARATION",
    });
    expect(result.page.map((transaction) => transaction.nom)).toEqual(["Réparation corde"]);
  });

  test("permet de poursuivre l'export après une page de recherche vide", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, ["compta"]);
    const staff = t.withIdentity({ subject: userId });
    const { tiersId, analytiqueId } = await t.run(async (ctx) => ({
      tiersId: await ctx.db.insert("tiers", { nom: "Fournisseur" }),
      analytiqueId: await ctx.db.insert("analytiques", { nom: "Matériel" }),
    }));

    // Le plus ancien correspond ; le plus récent remplit volontairement la première page.
    await insertTransaction(t, {
      nom: "Réparation casque",
      tiersId,
      analytiqueId,
    });
    await insertTransaction(t, { nom: "Brouillon", tiersId, analytiqueId });

    const firstPage = await staff.query(api.transactions.getExportPage, {
      saison: "2026-2027",
      paginationOpts: { cursor: null, numItems: 1 },
      searchQuery: "reparation",
    });
    expect(firstPage.page).toEqual([]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await staff.query(api.transactions.getExportPage, {
      saison: "2026-2027",
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
      searchQuery: "reparation",
    });
    expect(secondPage.page.map((transaction) => transaction.nom)).toEqual([
      "Réparation casque",
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  test("préserve les libellés Inconnu lorsque les relations ont été supprimées", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, ["compta"]);
    const staff = t.withIdentity({ subject: userId });
    const { tiersId, analytiqueId, typeId } = await t.run(async (ctx) => {
      const tiersId = await ctx.db.insert("tiers", { nom: "À supprimer" });
      const analytiqueId = await ctx.db.insert("analytiques", { nom: "À supprimer" });
      const typeId = await ctx.db.insert("typesDocuments", { nom: "À supprimer" });
      return { tiersId, analytiqueId, typeId };
    });
    await insertTransaction(t, {
      nom: "Archive",
      tiersId,
      analytiqueId,
      typeDocumentId: typeId,
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(tiersId);
      await ctx.db.delete(analytiqueId);
      await ctx.db.delete(typeId);
    });

    const result = await staff.query(api.transactions.getExportPage, {
      saison: "2026-2027",
      paginationOpts,
    });
    expect(result.page[0]).toMatchObject({
      tiersNom: "Inconnu",
      analytiqueNom: "Inconnu",
      typeDocumentNom: "Inconnu",
    });
  });

  test("refuse l'export à un staff sans tuile compta", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, []);
    const staff = t.withIdentity({ subject: userId });

    await expect(
      staff.query(api.transactions.getExportPage, {
        saison: "2026-2027",
        paginationOpts,
      }),
    ).rejects.toThrow("Accès refusé");
  });
});
