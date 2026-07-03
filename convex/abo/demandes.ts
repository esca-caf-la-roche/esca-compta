// Cœur du parcours Abonnements : demande (dossier + personnes) gatée par vague,
// suivi live, et vues admin (dossiers + validation par personne).
// Portage fidèle de :
//   - creer_demande_eleve.sql + anti_doublon_global.sql (creerDemande)
//   - ajouter_personne.sql + anti_doublon_global.sql (ajouterPersonne)
//   - supprimer_personne.sql (supprimerPersonne)
//   - mon_suivi.sql (monSuivi)
//   - valider_personne.sql (validerPersonne) + valider_dossier.sql (validerDossier)
//
// Sécurité : pas de RLS en Convex → chaque endpoint dérive l'identité côté serveur
// (getAuthUserId via authenticatedQuery/Mutation) et vérifie l'appartenance
// (owner_id === userId) ou le rôle admin via les helpers de ./auth.

import { v, ConvexError } from "convex/values";
import { authenticatedQuery, authenticatedMutation } from "../customFunctions";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireAboIdentity, requireAboAdmin } from "./auth";
import { canoniserLicence, normaliserNomPrenom } from "./lib";
import { vagueCourante } from "./config";

// Statut de dossier → email transactionnel à envoyer (null si aucun).
type TypeEmailStatut = "validation" | "liste_attente" | "refus";
function typeEmailPourStatut(
  s: Doc<"abo_dossiers">["statut_dossier"],
): TypeEmailStatut | null {
  if (s === "validee") return "validation";
  if (s === "liste_attente") return "liste_attente";
  if (s === "refusee") return "refus";
  return null;
}

// Planifie l'email de changement de statut si le dossier bascule vers un état
// terminal (l'anti-doublon abo_email_log garantit un seul envoi par type).
async function planifierEmailStatut(
  ctx: MutationCtx,
  dossierId: Id<"abo_dossiers">,
  ancien: Doc<"abo_dossiers">["statut_dossier"],
  nouveau: Doc<"abo_dossiers">["statut_dossier"],
): Promise<void> {
  if (nouveau === ancien) return;
  const type = typeEmailPourStatut(nouveau);
  if (!type) return;
  await ctx.scheduler.runAfter(0, internal.abo.emails.envoyerEmailAbo, {
    dossierId,
    typeEmail: type,
  });
}

const decisionValidator = v.union(
  v.literal("validee"),
  v.literal("liste_attente"),
  v.literal("refusee"),
);

// Personne prête à insérer (identité + licence résolues selon la vague).
interface PersonneResolue {
  nom: string;
  prenom: string;
  licence: string | null;
  licence_statut: "saisie" | "inconnu";
}

// Applique les règles de vague à une saisie { nom?, prenom?, licence? } et
// renvoie l'identité résolue. Vague 2 : licence obligatoire, nom/prénom résolus
// depuis abo_eleves_en_cours (jamais renvoyés au client). Vague ≥ 3 : nom/prénom
// requis, licence facultative. Lève une ConvexError { code, message } sinon.
async function resoudrePersonne(
  ctx: MutationCtx,
  vague: number,
  saisie: { nom?: string; prenom?: string; licence?: string },
): Promise<PersonneResolue> {
  const raw = (saisie.licence ?? "").trim();
  const licence = canoniserLicence(raw);

  if (raw !== "" && licence === null) {
    throw new ConvexError({
      code: "P0011",
      message: `Le numéro de licence « ${raw} » est invalide : 12 chiffres attendus (commence en général par 7480).`,
    });
  }

  if (vague === 2) {
    if (licence === null) {
      throw new ConvexError({
        code: "P0011",
        message:
          "Numéro de licence requis : en cette période, la demande est réservée aux élèves en cours d'escalade.",
      });
    }
    const eleve = await ctx.db
      .query("abo_eleves_en_cours")
      .withIndex("by_licence", (q) => q.eq("licence", licence))
      .first();
    if (!eleve || (!eleve.nom && !eleve.prenom)) {
      throw new ConvexError({
        code: "P0011",
        message: `La licence ${licence} n'est pas reconnue comme élève en cours d'escalade. Vous n'êtes pas inscrit en cours, ou votre inscription a été validée ce jour : réessayez dans 24 h.`,
      });
    }
    return {
      nom: eleve.nom ?? "",
      prenom: eleve.prenom ?? "",
      licence,
      licence_statut: "saisie",
    };
  }

  // Vague ≥ 3 : nom/prénom fournis, licence facultative.
  const nom = (saisie.nom ?? "").trim();
  const prenom = (saisie.prenom ?? "").trim();
  if (!nom || !prenom) {
    throw new ConvexError({
      code: "22023",
      message: "Nom et prénom sont requis pour chaque personne",
    });
  }
  return {
    nom,
    prenom,
    licence,
    licence_statut: licence !== null ? "saisie" : "inconnu",
  };
}

// Anti-doublon GLOBAL (toutes personnes, tous dossiers) AVANT insertion : par
// licence (si renseignée) OU par nom_prenom_normalise dans les deux orientations
// (nom↔prénom souvent intervertis). Lève ConvexError P0013 si la personne existe.
async function verifierAntiDoublon(
  ctx: MutationCtx,
  p: PersonneResolue,
): Promise<void> {
  if (p.licence !== null) {
    const lic = p.licence;
    const parLicence = await ctx.db
      .query("abo_personnes")
      .withIndex("by_licence", (q) => q.eq("licence", lic))
      .first();
    if (parLicence) throw doublon(p);
  }
  const norm = normaliserNomPrenom(p.nom, p.prenom);
  const normInv = normaliserNomPrenom(p.prenom, p.nom);
  for (const clef of normInv === norm ? [norm] : [norm, normInv]) {
    const match = await ctx.db
      .query("abo_personnes")
      .withIndex("by_nom_prenom_normalise", (q) =>
        q.eq("nom_prenom_normalise", clef),
      )
      .first();
    if (match) throw doublon(p);
  }
}

function doublon(p: PersonneResolue): ConvexError<{ code: string; message: string }> {
  const nomComplet = `${p.prenom} ${p.nom}`.trim();
  return new ConvexError({
    code: "P0013",
    message: `${nomComplet} a déjà fait une demande (une même personne ne peut s'inscrire qu'une seule fois).`,
  });
}

// Insère une personne résolue dans un dossier (valeurs par défaut des 8 étapes).
async function insererPersonne(
  ctx: MutationCtx,
  dossierId: Id<"abo_dossiers">,
  p: PersonneResolue,
): Promise<Id<"abo_personnes">> {
  return await ctx.db.insert("abo_personnes", {
    dossier_id: dossierId,
    nom: p.nom,
    prenom: p.prenom,
    nom_prenom_normalise: normaliserNomPrenom(p.nom, p.prenom),
    licence: p.licence ?? undefined,
    licence_statut: p.licence_statut,
    etape_demande: true,
    etape_validation: "en_attente",
    etape_licence: false,
    etape_inscription_site: false,
    etape_photo: false,
    etape_paiement: false,
    etape_abonnement_valide: false,
  });
}

// ── creerDemande : dossier + personnes, atomique, gatée par vague ────
export const creerDemande = authenticatedMutation({
  args: {
    commentaire: v.optional(v.string()),
    personnes: v.array(
      v.object({
        nom: v.optional(v.string()),
        prenom: v.optional(v.string()),
        licence: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAboIdentity(ctx);

    if (!Array.isArray(args.personnes) || args.personnes.length === 0) {
      throw new ConvexError({
        code: "22023",
        message: "Au moins une personne est requise",
      });
    }

    const vague = await vagueCourante(ctx);
    if (vague < 2) {
      throw new ConvexError({
        code: "P0010",
        message: "La demande de dispo n'est pas encore ouverte.",
      });
    }

    // 1 dossier par compte (owner). L'unicité par email est portée ici.
    const existant = await ctx.db
      .query("abo_dossiers")
      .withIndex("by_owner", (q) => q.eq("owner_id", identity.userId))
      .first();
    if (existant) {
      throw new ConvexError({
        code: "23505",
        message: "Une demande existe déjà pour votre compte.",
      });
    }

    const dossierId = await ctx.db.insert("abo_dossiers", {
      email: identity.email,
      owner_id: identity.userId,
      statut_dossier: "nouvelle_demande",
      date_soumission: new Date().toISOString(),
      commentaire: (args.commentaire ?? "").trim() || undefined,
    });

    // Insertion en boucle : les itérations précédentes sont visibles pour
    // l'anti-doublon intra-demande (les writes sont vus dans la transaction).
    for (const saisie of args.personnes) {
      const p = await resoudrePersonne(ctx, vague, saisie);
      await verifierAntiDoublon(ctx, p);
      await insererPersonne(ctx, dossierId, p);
    }

    // Accusé de réception (boîte abo, anti-doublon abo_email_log).
    await ctx.scheduler.runAfter(0, internal.abo.emails.envoyerEmailAbo, {
      dossierId,
      typeEmail: "accuse",
    });

    return dossierId;
  },
});

// ── ajouterPersonne : complète SON dossier depuis le suivi ───────────
export const ajouterPersonne = authenticatedMutation({
  args: {
    nom: v.optional(v.string()),
    prenom: v.optional(v.string()),
    licence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAboIdentity(ctx);
    const dossier = await ctx.db
      .query("abo_dossiers")
      .withIndex("by_owner", (q) => q.eq("owner_id", identity.userId))
      .first();
    if (!dossier) {
      throw new ConvexError({ code: "P0002", message: "Aucun dossier pour ce compte." });
    }

    const vague = await vagueCourante(ctx);
    if (vague < 2) {
      throw new ConvexError({
        code: "P0010",
        message: "La demande de dispo n'est pas ouverte.",
      });
    }

    const p = await resoudrePersonne(ctx, vague, args);
    await verifierAntiDoublon(ctx, p);
    return await insererPersonne(ctx, dossier._id, p);
  },
});

// ── supprimerPersonne : retire UNE personne (archive + purge dossier vide) ──
export const supprimerPersonne = authenticatedMutation({
  args: { personneId: v.id("abo_personnes") },
  handler: async (ctx, args) => {
    const identity = await requireAboIdentity(ctx);
    const personne = await ctx.db.get(args.personneId);
    if (!personne) {
      throw new ConvexError({
        code: "P0002",
        message: "Personne introuvable dans votre demande.",
      });
    }
    const dossier = await ctx.db.get(personne.dossier_id);
    if (!dossier || dossier.owner_id !== identity.userId) {
      throw new ConvexError({
        code: "P0002",
        message: "Personne introuvable dans votre demande.",
      });
    }

    // Archive « Prénom Nom — supprimée le … ».
    await ctx.db.insert("abo_demandes_supprimees", {
      email: dossier.email,
      owner_id: identity.userId,
      personnes: `${personne.prenom} ${personne.nom}`.trim(),
      supprime_le: new Date().toISOString(),
    });

    // Purge les réservations de test de la personne (cascade).
    await supprimerReservationsPersonne(ctx, personne._id);
    await ctx.db.delete(personne._id);

    const restantes = await ctx.db
      .query("abo_personnes")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
      .first();
    if (!restantes) {
      // Dossier vide : cascade messages / email_log puis suppression. Email libéré.
      await purgerDossier(ctx, dossier._id);
      return true;
    }
    return false;
  },
});

// Supprime toutes les réservations de test d'une personne.
async function supprimerReservationsPersonne(
  ctx: MutationCtx,
  personneId: Id<"abo_personnes">,
): Promise<void> {
  const resas = await ctx.db
    .query("abo_test_reservations")
    .withIndex("by_personne", (q) => q.eq("personne_id", personneId))
    .collect();
  for (const r of resas) await ctx.db.delete(r._id);
}

// Supprime un dossier vide et ses dépendances (messages, journal d'emails).
async function purgerDossier(
  ctx: MutationCtx,
  dossierId: Id<"abo_dossiers">,
): Promise<void> {
  const messages = await ctx.db
    .query("abo_messages")
    .withIndex("by_dossier", (q) => q.eq("dossier_id", dossierId))
    .collect();
  for (const m of messages) await ctx.db.delete(m._id);
  const logs = await ctx.db
    .query("abo_email_log")
    .withIndex("by_dossier", (q) => q.eq("dossier_id", dossierId))
    .collect();
  for (const l of logs) await ctx.db.delete(l._id);
  await ctx.db.delete(dossierId);
}

// ── getMonDossier : dossier + personnes du caller (owner) ────────────
export const getMonDossier = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAboIdentity(ctx);
    const dossier = await ctx.db
      .query("abo_dossiers")
      .withIndex("by_owner", (q) => q.eq("owner_id", identity.userId))
      .first();
    if (!dossier) return null;
    const personnes = await ctx.db
      .query("abo_personnes")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
      .collect();
    return {
      id: dossier._id,
      statut_dossier: dossier.statut_dossier,
      commentaire: dossier.commentaire ?? null,
      date_soumission: dossier.date_soumission,
      personnes: personnes.map(personneVue),
    };
  },
});

// Projection d'une personne pour le front (id lisible + champs d'étapes).
function personneVue(p: Doc<"abo_personnes">) {
  return {
    id: p._id,
    nom: p.nom,
    prenom: p.prenom,
    age: p.age ?? null,
    nom_prenom_normalise: p.nom_prenom_normalise,
    licence: p.licence ?? null,
    licence_statut: p.licence_statut,
    etape_demande: p.etape_demande,
    etape_validation: p.etape_validation,
    etape_licence: p.etape_licence,
    etape_test_autonomie: p.etape_test_autonomie ?? null,
    etape_inscription_site: p.etape_inscription_site,
    etape_photo: p.etape_photo,
    etape_paiement: p.etape_paiement,
    etape_abonnement_valide: p.etape_abonnement_valide,
  };
}

// ── getMesSuppressions : historique des retraits du caller ───────────
export const getMesSuppressions = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAboIdentity(ctx);
    const rows = await ctx.db
      .query("abo_demandes_supprimees")
      .withIndex("by_owner", (q) => q.eq("owner_id", identity.userId))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      email: r.email,
      personnes: r.personnes ?? null,
      supprime_le: r.supprime_le,
    }));
  },
});

// ── monSuivi : vérifs LIVE des étapes de finalisation (owner) ────────
// Recalculées à chaque affichage depuis abo_licences + abo_abonnes_scrap
// (indépendamment du batch de matching). Matching licence-first, repli nom/prénom.
export const monSuivi = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAboIdentity(ctx);
    const dossier = await ctx.db
      .query("abo_dossiers")
      .withIndex("by_owner", (q) => q.eq("owner_id", identity.userId))
      .first();
    if (!dossier) return [];
    const personnes = await ctx.db
      .query("abo_personnes")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
      .collect();

    const out = [];
    for (const p of personnes) {
      // Ligne du scrap correspondante (licence d'abord, sinon nom/prénom).
      let scrap: Doc<"abo_abonnes_scrap"> | null = null;
      if (p.licence) {
        scrap = await ctx.db
          .query("abo_abonnes_scrap")
          .withIndex("by_licence", (q) => q.eq("licence", p.licence))
          .first();
      }
      if (!scrap && p.nom_prenom_normalise) {
        scrap = await ctx.db
          .query("abo_abonnes_scrap")
          .withIndex("by_nom_prenom_normalise", (q) =>
            q.eq("nom_prenom_normalise", p.nom_prenom_normalise),
          )
          .first();
      }

      // Étape 1 : licence dans l'annuaire (par n°) OU adhésion OK au scrap.
      let licenceAnnuaire = false;
      if (p.licence) {
        const l = await ctx.db
          .query("abo_licences")
          .withIndex("by_licence", (q) => q.eq("licence", p.licence!))
          .first();
        licenceAnnuaire = l !== null;
      }
      const licence_ok = licenceAnnuaire || scrap?.adhesion === "OK";

      out.push({
        personne_id: p._id,
        licence_ok,
        inscription_ok: scrap !== null,
        paiement_ok: scrap?.abonnement_valide ?? false,
        test_autonomie: mapAutonomie(scrap?.autonomie),
        age: scrap?.age ?? p.age ?? null,
      });
    }
    return out;
  },
});

// Mapping du libellé « autonomie » du scrap → état de l'étape test (ou null).
function mapAutonomie(v?: string): "valide" | "non_requis" | "requis" | null {
  switch (v) {
    case "OK":
      return "valide";
    case "Trop jeune":
      return "non_requis";
    case "Doit passer le test":
    case "Recherche du test en cours":
      return "requis";
    default:
      return null;
  }
}

// ── getDossiersAdmin : tous les dossiers + personnes (admin) ─────────
export const getDossiersAdmin = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);
    const dossiers = await ctx.db.query("abo_dossiers").order("desc").take(500);
    const out = [];
    for (const d of dossiers) {
      const personnes = await ctx.db
        .query("abo_personnes")
        .withIndex("by_dossier", (q) => q.eq("dossier_id", d._id))
        .collect();
      out.push({
        id: d._id,
        email: d.email,
        statut_dossier: d.statut_dossier,
        date_soumission: d.date_soumission,
        date_validation: d.date_validation ?? null,
        commentaire: d.commentaire ?? null,
        personnes: personnes.map(personneVue),
      });
    }
    // Tri par date de soumission décroissante (fidèle à getDossiersAdmin).
    out.sort((a, b) => (a.date_soumission < b.date_soumission ? 1 : -1));
    return out;
  },
});

// ── getSuppressions : historique global (admin) ─────────────────────
export const getSuppressions = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireAboAdmin(ctx);
    const rows = await ctx.db
      .query("abo_demandes_supprimees")
      .order("desc")
      .take(200);
    return rows.map((r) => ({
      email: r.email,
      personnes: r.personnes ?? null,
      supprime_le: r.supprime_le,
    }));
  },
});

// Rollup du statut_dossier à partir de l'ensemble des personnes (règle de priorité).
function rollupStatut(
  personnes: Doc<"abo_personnes">[],
): Doc<"abo_dossiers">["statut_dossier"] {
  const etats = personnes.map((p) => p.etape_validation);
  if (etats.some((e) => e === "en_attente")) return "nouvelle_demande";
  if (etats.some((e) => e === "validee")) return "validee";
  if (etats.some((e) => e === "liste_attente")) return "liste_attente";
  return "refusee";
}

// Applique le rollup + pose date_validation à la 1re bascule en « validee ».
async function appliquerRollup(
  ctx: MutationCtx,
  dossier: Doc<"abo_dossiers">,
): Promise<void> {
  const personnes = await ctx.db
    .query("abo_personnes")
    .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
    .collect();
  const statut = rollupStatut(personnes);
  await ctx.db.patch(dossier._id, {
    statut_dossier: statut,
    date_validation:
      statut === "validee" && !dossier.date_validation
        ? new Date().toISOString()
        : dossier.date_validation,
  });
  await planifierEmailStatut(ctx, dossier._id, dossier.statut_dossier, statut);
}

// ── validerPersonne : décision admin PAR PERSONNE + rollup ──────────
export const validerPersonne = authenticatedMutation({
  args: { personneId: v.id("abo_personnes"), decision: decisionValidator },
  handler: async (ctx, args) => {
    await requireAboAdmin(ctx);
    const personne = await ctx.db.get(args.personneId);
    if (!personne) {
      throw new ConvexError({ code: "P0002", message: "Personne introuvable" });
    }
    await ctx.db.patch(personne._id, { etape_validation: args.decision });
    const dossier = await ctx.db.get(personne.dossier_id);
    if (dossier) await appliquerRollup(ctx, dossier);
    return null;
  },
});

// ── validerDossier : décision admin globale (compat) ────────────────
export const validerDossier = authenticatedMutation({
  args: { dossierId: v.id("abo_dossiers"), decision: decisionValidator },
  handler: async (ctx, args) => {
    await requireAboAdmin(ctx);
    const dossier = await ctx.db.get(args.dossierId);
    if (!dossier) {
      throw new ConvexError({ code: "P0002", message: "Dossier introuvable" });
    }
    await ctx.db.patch(dossier._id, {
      statut_dossier: args.decision,
      date_validation:
        args.decision === "validee"
          ? new Date().toISOString()
          : dossier.date_validation,
    });
    const personnes = await ctx.db
      .query("abo_personnes")
      .withIndex("by_dossier", (q) => q.eq("dossier_id", dossier._id))
      .collect();
    for (const p of personnes) {
      await ctx.db.patch(p._id, { etape_validation: args.decision });
    }
    await planifierEmailStatut(ctx, dossier._id, dossier.statut_dossier, args.decision);
    return null;
  },
});

// Type de la projection personne, utile aux modules voisins.
export type PersonneVue = ReturnType<typeof personneVue>;
