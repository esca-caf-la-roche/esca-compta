/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createStaff(
  t: ReturnType<typeof convexTest>,
  allowedTiles: string[],
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: `staff-${allowedTiles.join("-") || "none"}@example.test`,
    });
    await ctx.db.insert("userSettings", {
      userId,
      allowedTiles,
      role: "user",
    });
    return userId;
  });
}

function comptaArgs(transactionId: Id<"transactions">) {
  return {
    transactionId,
    saisonDirName: "2026-2027",
    analytiqueNom: "Escalade",
    date: "2026-08-03",
    typeDocumentNom: "Facture",
    tiersNom: "Fournisseur",
  };
}

async function createTransaction(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const tiersId = await ctx.db.insert("tiers", { nom: "Fournisseur" });
    const analytiqueId = await ctx.db.insert("analytiques", {
      nom: "Escalade",
    });
    return await ctx.db.insert("transactions", {
      nom: "Facture",
      date: "2026-08-03",
      realise: 10,
      tiersId,
      analytiqueId,
      saison: "2026-2027",
    });
  });
}

describe("endpoints comptabilite", () => {
  test("refusent un staff sans la tuile compta", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, []);
    const staff = t.withIdentity({ subject: userId });
    const transactionId = await createTransaction(t);
    const transaction = await t.run((ctx) => ctx.db.get(transactionId));
    if (!transaction) throw new Error("Transaction de test introuvable.");
    const paginationOpts = { cursor: null, numItems: 10 };

    await expect(
      staff.query(api.transactions.getStats, { saison: "2026-2027" }),
    ).rejects.toThrow("Accès refusé");
    await expect(
      staff.query(api.transactions.get, {
        saison: "2026-2027",
        paginationOpts,
      }),
    ).rejects.toThrow("Accès refusé");
    await expect(
      staff.mutation(api.transactions.create, {
        nom: "Nouvelle facture",
        date: "2026-08-03",
        realise: 12,
        tiersId: transaction.tiersId,
        analytiqueId: transaction.analytiqueId,
        saison: "2026-2027",
      }),
    ).rejects.toThrow("Accès refusé");
    await expect(
      staff.mutation(api.transactions.update, {
        id: transactionId,
        nom: "Facture modifiée",
      }),
    ).rejects.toThrow("Accès refusé");
    await expect(
      staff.mutation(api.transactions.remove, { id: transactionId }),
    ).rejects.toThrow("Accès refusé");
    await expect(
      staff.query(api.transactions.getExport, { saison: "2026-2027" }),
    ).rejects.toThrow("Accès refusé");
    await expect(staff.query(api.references.getTiers, {})).rejects.toThrow(
      "Accès refusé",
    );
    await expect(staff.query(api.references.getAnalytiques, {})).rejects.toThrow(
      "Accès refusé",
    );
    await expect(staff.query(api.typesDocuments.get, {})).rejects.toThrow(
      "Accès refusé",
    );
    await expect(
      staff.mutation(api.typesDocuments.create, { nom: "Facture" }),
    ).rejects.toThrow("Accès refusé");
    await expect(
      staff.action(api.drive.processTransactionDrive, comptaArgs(transactionId)),
    ).rejects.toThrow("Accès refusé");
  });

  test("autorise les endpoints compta pour un staff ayant la tuile", async () => {
    const t = convexTest(schema, modules);
    const userId = await createStaff(t, ["compta"]);
    const staff = t.withIdentity({ subject: userId });

    await expect(
      staff.query(api.transactions.getStats, { saison: "2026-2027" }),
    ).resolves.toMatchObject({ stats: { recettes: 0, depenses: 0, soldeNet: 0 } });
    await expect(staff.query(api.references.getTiers, {})).resolves.toEqual([]);

    await staff.mutation(api.typesDocuments.create, { nom: "Facture" });
    await expect(staff.query(api.typesDocuments.get, {})).resolves.toMatchObject([
      { nom: "Facture" },
    ]);

    const transactionId = await createTransaction(t);
    await expect(
      staff.action(api.drive.processTransactionDrive, comptaArgs(transactionId)),
    ).rejects.toThrow("identifiants Google Drive");
  });
});
