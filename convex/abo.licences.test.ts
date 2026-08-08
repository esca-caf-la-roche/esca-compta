/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function creerAdmin(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "admin@example.test" });
    await ctx.db.insert("userSettings", { userId: id, allowedTiles: ["abonnements"], role: "admin" });
    return id;
  });
  return t.withIdentity({ subject: userId });
}

async function creerPersonne(
  t: ReturnType<typeof convexTest>,
  email: string,
  licence?: string,
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email });
    const dossierId = await ctx.db.insert("abo_dossiers", {
      email, owner_id: ownerId, statut_dossier: "nouvelle_demande", date_soumission: "2026-08-08T00:00:00.000Z",
    });
    const personneId = await ctx.db.insert("abo_personnes", {
      dossier_id: dossierId, nom: "DUPONT", prenom: email.split("@")[0], nom_prenom_normalise: `DUPONT ${email.split("@")[0].toUpperCase()}`,
      licence, licence_statut: "inconnu", etape_demande: true, etape_validation: "en_attente", etape_licence: Boolean(licence),
      etape_inscription_site: false, etape_photo: false, etape_paiement: false, etape_abonnement_valide: false,
    });
    return { personneId, dossierId, ownerId };
  });
}

describe("conflits et fusions de licence", () => {
  test("signale la personne existante avant d'affecter une licence déjà portée", async () => {
    const t = convexTest(schema, modules);
    const admin = await creerAdmin(t);
    await creerPersonne(t, "ancienne@example.test", "123456789012");
    const nouvelle = await creerPersonne(t, "nouvelle@example.test");

    await expect(admin.mutation(api.abo.licences.validerLicence, {
      personneId: nouvelle.personneId,
      licence: "123456789012",
    })).resolves.toMatchObject({
      statut: "conflit",
      licence: "123456789012",
    });

    const state = await t.run(async (ctx) => await ctx.db.get(nouvelle.personneId));
    expect(state?.licence).toBeUndefined();
  });

  test("fusionne vers une personne sans licence et lui attribue la licence", async () => {
    const t = convexTest(schema, modules);
    const admin = await creerAdmin(t);
    const source = await creerPersonne(t, "ancienne@example.test", "123456789012");
    const cible = await creerPersonne(t, "nouvelle@example.test");

    await expect(admin.mutation(api.abo.licences.fusionnerPersonnesLicence, {
      personneSourceId: source.personneId,
      personneCibleId: cible.personneId,
    })).resolves.toMatchObject({
      personneCibleId: cible.personneId,
      dossierSourceSupprime: true,
    });

    const state = await t.run(async (ctx) => ({
      source: await ctx.db.get(source.personneId),
      cible: await ctx.db.get(cible.personneId),
      dossierSource: await ctx.db.get(source.dossierId),
    }));
    expect(state.source).toBeNull();
    expect(state.cible?.licence).toBe("123456789012");
    expect(state.dossierSource).toBeNull();
  });

  test("fusionne une personne doublon, réaffecte sa réservation et garde une trace", async () => {
    const t = convexTest(schema, modules);
    const admin = await creerAdmin(t);
    const source = await creerPersonne(t, "ancienne@example.test", "123456789012");
    const cible = await creerPersonne(t, "nouvelle@example.test", "123456789012");
    await expect(admin.query(api.abo.licences.getConflitsLicences, {})).resolves.toMatchObject([
      { licence: "123456789012", personnes: [{ personneId: source.personneId }, { personneId: cible.personneId }] },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("abo_test_reservations", {
        personne_id: source.personneId, tranche: "2026-08-08T10:00:00.000Z",
        statut: "annulee", etat_confirmation: "provisoire",
      });
    });

    await expect(admin.mutation(api.abo.licences.fusionnerPersonnesLicence, {
      personneSourceId: source.personneId,
      personneCibleId: cible.personneId,
    })).resolves.toMatchObject({
      reservationsReaffectees: 1,
      dossierSourceSupprime: true,
    });

    const state = await t.run(async (ctx) => ({
      source: await ctx.db.get(source.personneId),
      dossierSource: await ctx.db.get(source.dossierId),
      reservations: await ctx.db.query("abo_test_reservations").withIndex("by_personne", (q) => q.eq("personne_id", cible.personneId)).collect(),
      fusions: await ctx.db.query("abo_licence_fusions").withIndex("by_personne_source", (q) => q.eq("personne_source_id", source.personneId)).collect(),
    }));
    expect(state.source).toBeNull();
    expect(state.dossierSource).toBeNull();
    expect(state.reservations).toHaveLength(1);
    expect(state.fusions).toHaveLength(1);
  });

  test("conserve le dossier source s'il contient un message", async () => {
    const t = convexTest(schema, modules);
    const admin = await creerAdmin(t);
    const source = await creerPersonne(t, "ancienne@example.test", "123456789012");
    const cible = await creerPersonne(t, "nouvelle@example.test", "123456789012");
    await t.run(async (ctx) => {
      await ctx.db.insert("abo_messages", {
        dossier_id: source.dossierId,
        auteur_id: source.ownerId,
        auteur_role: "utilisateur",
        contenu: "Question déjà envoyée.",
        lu_par_admin: false,
        lu_par_user: true,
      });
    });

    await expect(admin.mutation(api.abo.licences.fusionnerPersonnesLicence, {
      personneSourceId: source.personneId,
      personneCibleId: cible.personneId,
    })).resolves.toMatchObject({ dossierSourceSupprime: false });

    const state = await t.run(async (ctx) => ({
      source: await ctx.db.get(source.personneId),
      dossierSource: await ctx.db.get(source.dossierId),
    }));
    expect(state.source).toBeNull();
    expect(state.dossierSource).not.toBeNull();
  });

});
