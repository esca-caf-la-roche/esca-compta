/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type PersonneOptions = {
  age?: number | null;
  testAutonomie?: "non_requis" | "requis" | "valide";
};

async function creerPersonne(
  t: ReturnType<typeof convexTest>,
  options: PersonneOptions = {},
): Promise<{ userId: Id<"users">; personneId: Id<"abo_personnes"> }> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "abo@example.test" });
    await ctx.db.insert("abo_profiles", {
      userId,
      email: "abo@example.test",
      role: "utilisateur",
    });
    const dossierId = await ctx.db.insert("abo_dossiers", {
      email: "abo@example.test",
      statut_dossier: "validee",
      date_soumission: "2026-08-01T00:00:00.000Z",
      owner_id: userId,
    });
    const personneId = await ctx.db.insert("abo_personnes", {
      dossier_id: dossierId,
      nom: "Candidate",
      prenom: "Test",
      nom_prenom_normalise: "candidate test",
      ...(options.age === null ? {} : { age: options.age ?? 16 }),
      licence_statut: "saisie",
      etape_demande: true,
      etape_validation: "validee",
      etape_licence: false,
      etape_test_autonomie: options.testAutonomie ?? "requis",
      etape_inscription_site: false,
      etape_photo: false,
      etape_paiement: false,
      etape_abonnement_valide: false,
    });
    return { userId, personneId };
  });
}

async function creerCreneau(
  t: ReturnType<typeof convexTest>,
  date: string,
): Promise<void> {
  await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: `admin-${date}@example.test` });
    await ctx.db.insert("abo_test_creneaux", {
      admin_id: adminId,
      date_jour: date,
      heure_debut: "10:00",
      heure_fin: "10:40",
    });
  });
}

async function trancheDisponible(
  caller: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
): Promise<string> {
  const creneaux = await caller.query(api.abo.tests.testCreneauxDisponibles, {});
  const tranche = creneaux[0]?.tranche_debut;
  if (!tranche) throw new Error("Créneau de test introuvable.");
  return tranche;
}

describe("réservation de test d'autonomie", () => {
  test("refuse une personne dont le test n'est pas requis", async () => {
    const t = convexTest(schema, modules);
    const { userId, personneId } = await creerPersonne(t, { testAutonomie: "non_requis" });
    const caller = t.withIdentity({ subject: userId });
    await creerCreneau(t, "2099-06-02");

    await expect(caller.mutation(api.abo.tests.reserverTest, {
      personneId,
      tranche: await trancheDisponible(caller),
    })).rejects.toThrow("n'a pas de test d'autonomie");
  });

  test("refuse une personne de moins de 16 ans", async () => {
    const t = convexTest(schema, modules);
    const { userId, personneId } = await creerPersonne(t, { age: 15 });
    const caller = t.withIdentity({ subject: userId });
    await creerCreneau(t, "2099-06-02");

    await expect(caller.mutation(api.abo.tests.reserverTest, {
      personneId,
      tranche: await trancheDisponible(caller),
    })).rejects.toThrow("16 ans et plus");
  });

  test("refuse une personne dont l'âge n'est pas encore connu", async () => {
    const t = convexTest(schema, modules);
    const { userId, personneId } = await creerPersonne(t, { age: null });
    const caller = t.withIdentity({ subject: userId });
    await creerCreneau(t, "2099-06-02");

    await expect(caller.mutation(api.abo.tests.reserverTest, {
      personneId,
      tranche: await trancheDisponible(caller),
    })).rejects.toThrow("16 ans et plus");
  });

  test("refuse une personne dont le test est déjà validé", async () => {
    const t = convexTest(schema, modules);
    const { userId, personneId } = await creerPersonne(t, { testAutonomie: "valide" });
    const caller = t.withIdentity({ subject: userId });
    await creerCreneau(t, "2099-06-02");

    await expect(caller.mutation(api.abo.tests.reserverTest, {
      personneId,
      tranche: await trancheDisponible(caller),
    })).rejects.toThrow("n'a pas de test d'autonomie");
  });

  test("refuse une tranche passée", async () => {
    const t = convexTest(schema, modules);
    const { userId, personneId } = await creerPersonne(t);
    const caller = t.withIdentity({ subject: userId });
    await creerCreneau(t, "2020-06-02");

    await expect(caller.mutation(api.abo.tests.reserverTest, {
      personneId,
      tranche: "2020-06-02T08:00:00.000Z",
    })).rejects.toThrow("créneau est passé");
  });

  test("autorise une personne de 16 ans avec un test requis sur une tranche future", async () => {
    const t = convexTest(schema, modules);
    const { userId, personneId } = await creerPersonne(t, { age: 16 });
    const caller = t.withIdentity({ subject: userId });
    await creerCreneau(t, "2099-06-02");

    await expect(caller.mutation(api.abo.tests.reserverTest, {
      personneId,
      tranche: await trancheDisponible(caller),
    })).resolves.toBeNull();
  });
});
