// Compteur des places / anomalies / élèves en cours (wave-aware). Portage de :
//   - v_legit_scrap.sql   → legitScrap (A1 N-1 ∨ A2 élèves ∨ A3 validées)
//   - compteur_wave.sql    → calculerCompteur (occupe = legit + validées hors scrap)
//   - v_anomalies.sql      → anomalies (scrap − legit, avec motif)
//   - compteur_public_wave.sql → compteurPublic (agrégat ANONYME, iframe club)
//   - eleves_en_cours.sql / import-eleves.js → getElevesEnCours + upsert
//
// Les vues Postgres (security_invoker) → queries Convex recalculant la même
// logique d'ensembles. Toutes les lectures sont bornées par la taille réelle du
// club (scrap ≈ places, annuaire/personnes = volume d'une saison).

import { v } from "convex/values";
import { query, internalMutation } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { authenticatedQuery, authenticatedMutation } from "../customFunctions";
import { requireAboAdmin } from "./auth";
import { vagueCourante, getConfigValeur } from "./config";
import { canoniserLicence, normaliserNomPrenom } from "./lib";
import { champsModifies } from "../dbUtils";

const PLACES_MAX_DEFAUT = 350;

// ── Cœur du compteur : ensembles legit / validées / anomalies ────────
// Un seul balayage borné des tables, réutilisé par vCompteur, vAnomalies et
// compteurPublic. Fidèle à l'algèbre d'ensembles des vues SQL wave-aware.
interface CompteurData {
  vague: number;
  abonnes_scrap: number;
  legit_scrap: number;
  demandes_validees: number;
  validees_hors_legit: number;
  anomalies: number;
  occupe: number;
  // Détail pour vAnomalies (ids du scrap légitime).
  legitIds: Set<string>;
}

async function calculerCompteur(ctx: QueryCtx | MutationCtx): Promise<CompteurData> {
  const vague = await vagueCourante(ctx);

  const scrap = await ctx.db.query("abo_abonnes_scrap").collect();
  const archive = await ctx.db.query("abo_abonnes_archive").collect();
  const eleves = await ctx.db.query("abo_eleves_en_cours").collect();
  const personnes = await ctx.db.query("abo_personnes").collect();

  // A1 : abonnés validés N-1 (droit acquis, toutes vagues) — par licence.
  const archiveValidLic = new Set<string>();
  for (const a of archive) {
    if (a.abonnement_valide && a.licence) archiveValidLic.add(a.licence);
  }
  // A2 : élèves en cours d'escalade (vague ≥ 2) — par licence.
  const elevesLic = new Set<string>();
  for (const e of eleves) if (e.licence) elevesLic.add(e.licence);

  // A3 : demandes validées chez nous (vague ≥ 2) — licence sinon nom+prénom.
  const valides = personnes.filter((p) => p.etape_validation === "validee");
  const validesLic = new Set<string>();
  const validesNoms = new Set<string>();
  for (const p of valides) {
    if (p.licence) validesLic.add(p.licence);
    validesNoms.add(p.nom_prenom_normalise);
  }

  // Légitimité d'une ligne du scrap pour la vague courante (A1 ∨ A2 ∨ A3).
  const estLegit = (s: (typeof scrap)[number]): boolean => {
    if (s.licence && archiveValidLic.has(s.licence)) return true; // A1
    if (vague >= 2) {
      if (s.licence && elevesLic.has(s.licence)) return true; // A2
      if (s.licence && validesLic.has(s.licence)) return true; // A3 (licence)
      if (validesNoms.has(s.nom_prenom_normalise)) return true; // A3 (nom+prénom)
    }
    return false;
  };

  const legit = scrap.filter(estLegit);
  const legitIds = new Set(legit.map((s) => s._id as string));

  // Dédoublonnage validée ↔ scrap : une demande validée déjà présente dans le
  // scrap légitime n'est pas recomptée (piège §8 cas 2).
  const legitLic = new Set<string>();
  const legitNoms = new Set<string>();
  for (const s of legit) {
    if (s.licence) legitLic.add(s.licence);
    legitNoms.add(s.nom_prenom_normalise);
  }
  const validees_hors_legit = valides.filter((p) => {
    const dansScrap =
      (p.licence != null && legitLic.has(p.licence)) ||
      legitNoms.has(p.nom_prenom_normalise);
    return !dansScrap;
  }).length;

  const legit_scrap = legit.length;
  return {
    vague,
    abonnes_scrap: scrap.length,
    legit_scrap,
    demandes_validees: valides.length,
    validees_hors_legit,
    anomalies: scrap.length - legit_scrap,
    occupe: legit_scrap + validees_hors_legit,
    legitIds,
  };
}

// Plafond de places (abo_app_config.places_max), défaut 350.
async function lirePlacesMax(ctx: QueryCtx | MutationCtx): Promise<number> {
  const brut = await getConfigValeur(ctx, "places_max");
  const n = brut != null ? parseInt(brut, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : PLACES_MAX_DEFAUT;
}

// ── vCompteur : compteur détaillé (admin) ────────────────────────────
export const vCompteur = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);
    const c = await calculerCompteur(ctx);
    const places_max = await lirePlacesMax(ctx);
    return {
      vague: c.vague,
      abonnes_scrap: c.abonnes_scrap,
      legit_scrap: c.legit_scrap,
      demandes_validees: c.demandes_validees,
      validees_hors_legit: c.validees_hors_legit,
      anomalies: c.anomalies,
      occupe: c.occupe,
      places_max,
    };
  },
});

// ── vAnomalies : lignes du scrap non légitimes + motif (admin) ───────
export const vAnomalies = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);
    const c = await calculerCompteur(ctx);
    const scrap = await ctx.db.query("abo_abonnes_scrap").collect();

    const motifBase =
      c.vague <= 1
        ? "Pas abonné·e validé·e N-1 (réinscription anticipée)"
        : "Ni abonné·e N-1, ni élève en cours, ni demande validée";

    const out = scrap
      .filter((s) => !c.legitIds.has(s._id as string))
      .map((s) => ({
        licence: s.licence ?? null,
        nom: s.nom ?? null,
        prenom: s.prenom ?? null,
        nom_prenom_normalise: s.nom_prenom_normalise,
        abonnement_valide: s.abonnement_valide,
        raison: motifBase + (s.licence ? "" : " — sans n° de licence"),
      }));
    out.sort((a, b) =>
      a.nom_prenom_normalise.localeCompare(b.nom_prenom_normalise, "fr"),
    );
    return out;
  },
});

// ── compteurPublic : agrégat ANONYME pour l'iframe du site club ──────
// 🔒 EXCEPTION DÉLIBÉRÉE à la règle « authenticatedQuery » : équivalent Convex de
// compteur_public() (SECURITY DEFINER, accordée à anon). L'iframe du club doit
// afficher les places sans connexion ; on ne renvoie donc QUE des ENTIERS
// (occupe / plafond / restantes), aucune donnée nominative n'est exposée.
// PUBLIC: endpoint anonyme assumé (iframe du site club).
export const compteurPublic = query({
  args: {},
  handler: async (ctx) => {
    const c = await calculerCompteur(ctx);
    const places_max = await lirePlacesMax(ctx);
    return {
      occupe: c.occupe,
      places_max,
      places_restantes: places_max - c.occupe,
    };
  },
});

// ── getElevesEnCours : élèves en cours (admin) pour les badges ───────
// Renvoie une liste plate (licence / nom_prenom_normalise / horaire) ; le front
// construit les tables de matching (par licence, repli nom+prénom).
export const getElevesEnCours = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);
    const eleves = await ctx.db.query("abo_eleves_en_cours").collect();
    return eleves.map((e) => ({
      licence: e.licence ?? null,
      nom_prenom_normalise: e.nom_prenom_normalise,
      horaire: e.horaire ?? null,
    }));
  },
});

// ── setPlacesMax : plafond de places (admin) ─────────────────────────
export const setPlacesMax = authenticatedMutation({
  args: { places_max: v.number() },
  handler: async (ctx, args) => {
    await requireAboAdmin(ctx);
    const n = Math.round(args.places_max);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("Nombre de places invalide.");
    }
    const row = await ctx.db
      .query("abo_app_config")
      .withIndex("by_cle", (q) => q.eq("cle", "places_max"))
      .first();
    const patch = { valeur: String(n), updated_at: new Date().toISOString() };
    if (row) {
      await ctx.db.patch(row._id, patch);
    } else {
      await ctx.db.insert("abo_app_config", { cle: "places_max", ...patch });
    }
    return null;
  },
});

// ── remplacerElevesEnCours : import (interne, appelé par le scrap Phase H) ──
// Reçoit les lignes DÉJÀ filtrées (hors « Liste d'attente »). Upsert par licence
// canonique ; les lignes sans licence (matching nom+prénom) sont rafraîchies par
// saison (purge ciblée puis insertion) pour rester idempotent au fil des imports.
// La liste des élèves d'une saison tient dans une transaction (quelques centaines).
export const remplacerElevesEnCours = internalMutation({
  args: {
    saison: v.string(),
    lignes: v.array(
      v.object({
        licence: v.optional(v.string()),
        nom: v.optional(v.string()),
        prenom: v.optional(v.string()),
        horaire: v.optional(v.string()),
        age: v.optional(v.string()),
        cours: v.optional(v.string()),
        date_naissance: v.optional(v.string()),
        encadrants: v.optional(v.string()),
        date_inscription: v.optional(v.string()),
        licence_saison: v.optional(v.string()),
        licence_saisie: v.optional(v.string()),
        paiement_recu: v.optional(v.string()),
        paiements_dossier: v.optional(v.string()),
        saison_precedente: v.optional(v.string()),
        telephone_eleve: v.optional(v.string()),
        telephone_gestion: v.optional(v.string()),
        email_eleve: v.optional(v.string()),
        email_gestion: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const maintenant = new Date().toISOString();

    const doc = (l: (typeof args.lignes)[number], licence: string | undefined) => {
      const nom = (l.nom ?? "").trim() || undefined;
      const prenom = (l.prenom ?? "").trim() || undefined;
      return {
        licence,
        nom,
        prenom,
        nom_prenom_normalise: normaliserNomPrenom(nom, prenom),
        horaire: (l.horaire ?? "").trim() || undefined,
        saison: args.saison,
        imported_at: maintenant,
        age: l.age,
        cours: l.cours,
        date_naissance: l.date_naissance,
        encadrants: l.encadrants,
        date_inscription: l.date_inscription,
        licence_saison: l.licence_saison,
        licence_saisie: l.licence_saisie,
        paiement_recu: l.paiement_recu,
        paiements_dossier: l.paiements_dossier,
        saison_precedente: l.saison_precedente,
        telephone_eleve: l.telephone_eleve,
        telephone_gestion: l.telephone_gestion,
        email_eleve: l.email_eleve,
        email_gestion: l.email_gestion,
      };
    };

    // 1) Lignes AVEC licence : upsert par licence canonique.
    let avecLicence = 0;
    for (const l of args.lignes) {
      const licence = canoniserLicence(l.licence);
      if (!licence) continue;
      const existant = await ctx.db
        .query("abo_eleves_en_cours")
        .withIndex("by_licence", (q) => q.eq("licence", licence))
        .first();
      if (existant) {
        // `imported_at` change à chaque import : ignoré pour ne réécrire (et ne
        // réinvalider la tuile "licences élèves en cours") qu'en cas de vrai
        // changement des données de l'élève.
        const nouveau = doc(l, licence);
        if (champsModifies(existant, nouveau, ["imported_at"])) {
          await ctx.db.patch(existant._id, nouveau);
        }
      } else {
        await ctx.db.insert("abo_eleves_en_cours", doc(l, licence));
      }
      avecLicence++;
    }

    // 2) Lignes SANS licence : purge ciblée de la saison (index by_licence sur
    //    undefined) puis réinsertion — idempotent.
    const sansLicenceExistants = await ctx.db
      .query("abo_eleves_en_cours")
      .withIndex("by_licence", (q) => q.eq("licence", undefined))
      .collect();
    for (const e of sansLicenceExistants) {
      if (e.saison === args.saison) await ctx.db.delete(e._id);
    }
    let sansLicence = 0;
    for (const l of args.lignes) {
      if (canoniserLicence(l.licence)) continue;
      // On n'insère que des lignes nominatives (au moins un nom/prénom).
      if (!(l.nom ?? "").trim() && !(l.prenom ?? "").trim()) continue;
      await ctx.db.insert("abo_eleves_en_cours", doc(l, undefined));
      sansLicence++;
    }

    return { avecLicence, sansLicence };
  },
});
