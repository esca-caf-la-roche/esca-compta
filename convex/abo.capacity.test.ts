/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function creerAdmin(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "admin-capacite@example.test" });
    await ctx.db.insert("userSettings", {
      userId: id,
      allowedTiles: ["abonnements"],
      role: "user",
    });
    return id;
  });
  return t.withIdentity({ subject: userId });
}

async function insererDossierAvecPersonnes(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<"users">,
  decisions: Array<"en_attente" | "validee" | "liste_attente" | "refusee">,
) {
  return await t.run(async (ctx) => {
    const placesMax = await ctx.db
      .query("abo_app_config")
      .withIndex("by_cle", (q) => q.eq("cle", "places_max"))
      .first();
    if (!placesMax) {
      await ctx.db.insert("abo_app_config", { cle: "places_max", valeur: "2" });
    }
    const dossierId = await ctx.db.insert("abo_dossiers", {
      email: "demandeur-capacite@example.test",
      owner_id: ownerId,
      statut_dossier: "nouvelle_demande",
      date_soumission: "2026-08-07T12:00:00.000Z",
    });
    const personnes = [];
    for (const [index, decision] of decisions.entries()) {
      personnes.push(
        await ctx.db.insert("abo_personnes", {
          dossier_id: dossierId,
          nom: `Nom${index}`,
          prenom: `Prenom${index}`,
          nom_prenom_normalise: `nom${index} prenom${index}`,
          licence_statut: "inconnu",
          etape_demande: true,
          etape_validation: decision,
          etape_licence: false,
          etape_inscription_site: false,
          etape_photo: false,
          etape_paiement: false,
          etape_abonnement_valide: false,
        }),
      );
    }
    return { dossierId, personnes };
  });
}

describe("plafond de capacité des validations Abonnements", () => {
  test("accepte la place qui atteint exactement le plafond puis place la suivante en attente", async () => {
    const t = convexTest(schema, modules);
    const admin = await creerAdmin(t);
    const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: "demandeur@example.test" }));
    const { personnes } = await insererDossierAvecPersonnes(t, ownerId, ["validee", "en_attente", "en_attente"]);

    const auPlafond = await admin.mutation(api.abo.demandes.validerPersonne, {
      personneId: personnes[1],
      decision: "validee",
    });
    expect(auPlafond).toMatchObject({
      decisionAppliquee: "validee",
      plafond: 2,
      occupeAvant: 1,
      occupeApres: 2,
      derogationUtilisee: false,
    });

    const depassement = await admin.mutation(api.abo.demandes.validerPersonne, {
      personneId: personnes[2],
      decision: "validee",
    });
    expect(depassement).toMatchObject({
      decisionAppliquee: "liste_attente",
      plafond: 2,
      occupeAvant: 2,
      occupeApres: 2,
      derogationUtilisee: false,
    });
  });

  test("préserve les validations acquises du dossier mixte et accepte uniquement une dérogation explicite", async () => {
    const t = convexTest(schema, modules);
    const admin = await creerAdmin(t);
    const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: "demandeur-global@example.test" }));
    const cible = await insererDossierAvecPersonnes(t, ownerId, ["validee", "en_attente", "en_attente"]);

    const attente = await admin.mutation(api.abo.demandes.validerDossier, {
      dossierId: cible.dossierId,
      decision: "validee",
    });
    expect(attente).toMatchObject({
      decisionAppliquee: "liste_attente",
      occupeAvant: 1,
      occupeApres: 1,
      derogationUtilisee: false,
    });

    // Le dossier est « validée » par priorité de rollup car il contient déjà
    // une personne validée. L'email associé reste donc, historiquement, un
    // email de dossier et ne détaille pas les personnes en attente.
    const etatsMixtes = await t.run(async (ctx) => ({
      dossier: await ctx.db.get(cible.dossierId),
      personnes: await Promise.all(cible.personnes.map((id) => ctx.db.get(id))),
    }));
    expect(etatsMixtes.dossier?.statut_dossier).toBe("validee");
    expect(etatsMixtes.personnes.map((personne) => personne?.etape_validation)).toEqual([
      "validee",
      "liste_attente",
      "liste_attente",
    ]);

    const derogation = await admin.mutation(api.abo.demandes.validerDossier, {
      dossierId: cible.dossierId,
      decision: "validee",
      autoriserDepassementPlafond: true,
    });
    expect(derogation).toMatchObject({
      decisionAppliquee: "validee",
      plafond: 2,
      occupeAvant: 1,
      occupeApres: 3,
      derogationUtilisee: true,
    });

    const etats = await t.run(async (ctx) => ({
      dossier: await ctx.db.get(cible.dossierId),
      personnes: await Promise.all(cible.personnes.map((id) => ctx.db.get(id))),
    }));
    expect(etats.dossier?.statut_dossier).toBe("validee");
    expect(etats.personnes.map((personne) => personne?.etape_validation)).toEqual([
      "validee",
      "validee",
      "validee",
    ]);
  });
});
