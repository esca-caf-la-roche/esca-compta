// Suivi transversal des remboursements élèves.
// SAISON-EXEMPT: une demande reste ouverte jusqu'à son paiement complet et
// son archive doit rester consultable indépendamment de la saison comptable.

import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  authenticatedMutation,
  authenticatedQuery,
} from "./customFunctions";
import { requireTile } from "./access";
import { champsModifies } from "./dbUtils";

const MAX_ELEVES = 1_000;
const MAX_BENEFICIAIRES_PAR_DEMANDE = 100;
const MAX_EMAILS_PAR_BENEFICIAIRE = 20;
const MAX_MONTANT_CENTIMES = 100_000_000;

const typeFormulaireValidator = v.union(
  v.literal("competition"),
  v.literal("stage"),
);
const calculValidator = v.union(
  v.object({
    type: v.literal("total_reparti"),
    montantTotalCentimes: v.number(),
  }),
  v.object({
    type: v.literal("prix_fixe_personne"),
    prixParPersonneCentimes: v.number(),
  }),
);
const statutPaiementValidator = v.union(
  v.literal("authorized"),
  v.literal("pending"),
  v.literal("refused"),
  v.literal("canceled"),
  v.literal("refunded"),
  v.literal("unknown"),
);
const rapprochementRetourValidator = v.object({
  rapprochementId: v.id("remboursements_rapprochements"),
  paiementId: v.id("remboursements_helloasso_paiements"),
  helloassoPaymentId: v.string(),
  amountCentimes: v.number(),
  datePaiement: v.string(),
  statut: statutPaiementValidator,
  rapprocheAt: v.string(),
});
const beneficiaireRetourValidator = v.object({
  beneficiaireId: v.id("remboursements_beneficiaires"),
  sourceEleveId: v.union(v.id("abo_eleves_en_cours"), v.null()),
  nom: v.string(),
  prenom: v.string(),
  email: v.union(v.string(), v.null()),
  licence: v.union(v.string(), v.null()),
  cours: v.union(v.string(), v.null()),
  horaire: v.union(v.string(), v.null()),
  montantDuCentimes: v.number(),
  montantPayeCentimes: v.number(),
  soldeCentimes: v.number(),
  dernierEmailInitialAt: v.union(v.string(), v.null()),
  dernierEmailRelanceAt: v.union(v.string(), v.null()),
  rapprochements: v.array(rapprochementRetourValidator),
});
const demandeRetourValidator = v.object({
  demandeId: v.id("remboursements_demandes"),
  reference: v.string(),
  typeFormulaire: typeFormulaireValidator,
  libelle: v.string(),
  dateEvenement: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  calcul: calculValidator,
  statut: v.union(v.literal("active"), v.literal("archivee")),
  createdAt: v.string(),
  updatedAt: v.string(),
  archivedAt: v.union(v.string(), v.null()),
  annuleeAt: v.union(v.string(), v.null()),
  motifAnnulation: v.union(v.string(), v.null()),
  montantDuCentimes: v.number(),
  montantPayeCentimes: v.number(),
  beneficiaires: v.array(beneficiaireRetourValidator),
});

function erreur(message: string, code = "400"): never {
  throw new ConvexError({ code, message });
}

function texteRequis(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized) erreur(`${label} est obligatoire.`);
  if (normalized.length > max) erreur(`${label} est trop long (${max} caractères maximum).`);
  return normalized;
}

function texteOptionnel(
  value: string | undefined,
  label: string,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) erreur(`${label} est trop long (${max} caractères maximum).`);
  return normalized;
}

function montantValide(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_MONTANT_CENTIMES) {
    erreur(`${label} doit être un nombre entier de centimes strictement positif.`);
  }
  return value;
}

function emailUniqueStrict(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const email = value?.trim().toLocaleLowerCase("fr");
    if (
      email &&
      email.length <= 254 &&
      ![...email].some((char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127) &&
      !/[\s,;]/.test(email) &&
      /^[^@]+@[^@.]+(?:\.[^@.]+)+$/.test(email)
    ) {
      return email;
    }
  }
  return undefined;
}

function estListeAttente(horaire: string | undefined): boolean {
  return (horaire ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr") === "liste d'attente";
}

function normaliser(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function assertLimit(length: number, max: number, label: string): void {
  if (length > max) erreur(`${label} dépasse la limite de ${max}.`, "54000");
}

async function getBeneficiaires(
  ctx: Parameters<typeof requireTile>[0],
  demandeId: Id<"remboursements_demandes">,
) {
  const rows = await ctx.db
    .query("remboursements_beneficiaires")
    .withIndex("by_demandeId", (q) => q.eq("demandeId", demandeId))
    .take(MAX_BENEFICIAIRES_PAR_DEMANDE);
  return rows;
}

async function enrichirBeneficiaire(
  ctx: Parameters<typeof requireTile>[0],
  beneficiaire: Doc<"remboursements_beneficiaires">,
) {
  const [rapprochements, emailLogs] = await Promise.all([
    ctx.db
      .query("remboursements_rapprochements")
      .withIndex("by_beneficiaireId", (q) => q.eq("beneficiaireId", beneficiaire._id))
      .take(100),
    ctx.db
      .query("remboursements_email_log")
      .withIndex("by_beneficiaireId", (q) =>
        q.eq("beneficiaireId", beneficiaire._id),
      )
      .order("desc")
      .take(MAX_EMAILS_PAR_BENEFICIAIRE),
  ]);
  const paiements = await Promise.all(
    rapprochements.map(async (rapprochement) => {
      const paiement = await ctx.db.get(
        "remboursements_helloasso_paiements",
        rapprochement.paiementId,
      );
      return paiement
        ? {
            rapprochementId: rapprochement._id,
            paiementId: paiement._id,
            helloassoPaymentId: paiement.helloassoPaymentId,
            amountCentimes: paiement.amountCentimes,
            datePaiement: paiement.datePaiement,
            statut: paiement.statut,
            rapprocheAt: rapprochement.rapprocheAt,
          }
        : null;
    }),
  );
  const presents = paiements.filter((p) => p !== null);
  const montantPayeCentimes = presents.reduce(
    (total, paiement) =>
      total + (paiement.statut === "authorized" ? paiement.amountCentimes : 0),
    0,
  );
  const logs = emailLogs.filter((log) => log.beneficiaireId === beneficiaire._id);
  const dernier = (type: "initial" | "relance") =>
    logs
      .filter((log) => log.typeEmail === type)
      .map((log) => log.preparedAt)
      .sort()
      .at(-1) ?? null;
  return {
    beneficiaireId: beneficiaire._id,
    sourceEleveId: beneficiaire.sourceEleveId ?? null,
    nom: beneficiaire.nom,
    prenom: beneficiaire.prenom,
    email: beneficiaire.email ?? null,
    licence: beneficiaire.licence ?? null,
    cours: beneficiaire.cours ?? null,
    horaire: beneficiaire.horaire ?? null,
    montantDuCentimes: beneficiaire.montantDuCentimes,
    montantPayeCentimes,
    soldeCentimes: beneficiaire.montantDuCentimes - montantPayeCentimes,
    dernierEmailInitialAt: dernier("initial"),
    dernierEmailRelanceAt: dernier("relance"),
    rapprochements: presents,
  };
}

export const listEleves = authenticatedQuery({
  args: {},
  returns: v.array(
    v.object({
      eleveId: v.id("abo_eleves_en_cours"),
      nom: v.union(v.string(), v.null()),
      prenom: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      licence: v.union(v.string(), v.null()),
      cours: v.union(v.string(), v.null()),
      horaire: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const rows = await ctx.db.query("abo_eleves_en_cours").take(MAX_ELEVES);
    return rows
      .filter((eleve) => !estListeAttente(eleve.horaire))
      .map((eleve) => ({
        eleveId: eleve._id,
        nom: eleve.nom ?? null,
        prenom: eleve.prenom ?? null,
        email: emailUniqueStrict(eleve.email_eleve, eleve.email_gestion) ?? null,
        licence: eleve.licence ?? eleve.licence_saisie ?? null,
        cours: eleve.cours ?? null,
        horaire: eleve.horaire ?? null,
      }))
      .sort((a, b) =>
        `${a.nom ?? ""} ${a.prenom ?? ""} ${a.cours ?? ""}`.localeCompare(
          `${b.nom ?? ""} ${b.prenom ?? ""} ${b.cours ?? ""}`,
          "fr",
        ),
      );
  },
});

export const listDemandes = authenticatedQuery({
  args: {
    statut: v.union(v.literal("active"), v.literal("archivee")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(demandeRetourValidator),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const result = await ctx.db
      .query("remboursements_demandes")
      .withIndex("by_statut", (q) => q.eq("statut", args.statut))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (demande) => {
        const beneficiaires = await getBeneficiaires(ctx, demande._id);
        const enrichis = await Promise.all(
          beneficiaires.map((beneficiaire) =>
            enrichirBeneficiaire(ctx, beneficiaire),
          ),
        );
        return {
          demandeId: demande._id,
          reference: demande.reference,
          typeFormulaire: demande.typeFormulaire,
          libelle: demande.libelle,
          dateEvenement: demande.dateEvenement ?? null,
          description: demande.description ?? null,
          calcul: demande.calcul,
          statut: demande.statut,
          createdAt: demande.createdAt,
          updatedAt: demande.updatedAt,
          archivedAt: demande.archivedAt ?? null,
          annuleeAt: demande.annuleeAt ?? null,
          motifAnnulation: demande.motifAnnulation ?? null,
          montantDuCentimes: enrichis.reduce((s, b) => s + b.montantDuCentimes, 0),
          montantPayeCentimes: enrichis.reduce(
            (s, b) => s + b.montantPayeCentimes,
            0,
          ),
          beneficiaires: enrichis,
        };
      }),
    );
    return { ...result, page };
  },
});

export const listPaiementsDisponibles = authenticatedQuery({
  args: {
    demandeId: v.id("remboursements_demandes"),
    beneficiaireId: v.id("remboursements_beneficiaires"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      paiementId: v.id("remboursements_helloasso_paiements"),
      helloassoPaymentId: v.string(),
      payeurNom: v.string(),
      payeurPrenom: v.string(),
      payeurEmail: v.string(),
      participantNom: v.union(v.string(), v.null()),
      participantPrenom: v.union(v.string(), v.null()),
      amountCentimes: v.number(),
      statut: statutPaiementValidator,
      datePaiement: v.string(),
      suggestion: v.union(
        v.object({
          score: v.number(),
          raisons: v.array(v.string()),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const [demande, beneficiaire] = await Promise.all([
      ctx.db.get("remboursements_demandes", args.demandeId),
      ctx.db.get("remboursements_beneficiaires", args.beneficiaireId),
    ]);
    if (!demande || !beneficiaire) {
      erreur("Demande ou bénéficiaire introuvable.", "404");
    }
    if (beneficiaire.demandeId !== demande._id) {
      erreur("Le bénéficiaire n'appartient pas à cette demande.");
    }
    const rapprochementsExistants = await ctx.db
      .query("remboursements_rapprochements")
      .withIndex("by_beneficiaireId", (q) =>
        q.eq("beneficiaireId", beneficiaire._id),
      )
      .take(100);
    const paiementsExistants = await Promise.all(
      rapprochementsExistants.map((rapprochement) =>
        ctx.db.get(
          "remboursements_helloasso_paiements",
          rapprochement.paiementId,
        ),
      ),
    );
    const montantPayeCentimes = paiementsExistants.reduce(
      (total, paiement) =>
        total + (paiement?.statut === "authorized" ? paiement.amountCentimes : 0),
      0,
    );
    const soldeCentimes = Math.max(
      0,
      beneficiaire.montantDuCentimes - montantPayeCentimes,
    );
    const paiements = await ctx.db
      .query("remboursements_helloasso_paiements")
      .withIndex("by_typeFormulaire_and_statut_and_datePaiement", (q) =>
        q
          .eq("typeFormulaire", demande.typeFormulaire)
          .eq("statut", "authorized"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const disponibles = await Promise.all(
      paiements.page.map(async (paiement) => {
          const lien = await ctx.db
            .query("remboursements_rapprochements")
            .withIndex("by_paiementId", (q) => q.eq("paiementId", paiement._id))
            .first();
          if (lien) return null;
          const raisons: string[] = [];
          let score = 0;
          const emailsPaiement = [paiement.payeurEmail, paiement.participantEmail]
            .filter((email): email is string => Boolean(email))
            .map((email) => email.trim().toLocaleLowerCase("fr"));
          if (
            beneficiaire.email &&
            emailsPaiement.includes(beneficiaire.email.trim().toLocaleLowerCase("fr"))
          ) {
            score += 50;
            raisons.push("même adresse e-mail (+50)");
          }
          const nomBeneficiaire = normaliser(
            `${beneficiaire.prenom} ${beneficiaire.nom}`,
          );
          const nomsPaiement = [
            normaliser(`${paiement.payeurPrenom} ${paiement.payeurNom}`),
            normaliser(
              `${paiement.participantPrenom ?? ""} ${paiement.participantNom ?? ""}`,
            ),
          ];
          if (nomBeneficiaire && nomsPaiement.includes(nomBeneficiaire)) {
            score += 30;
            raisons.push("même prénom et nom (+30)");
          }
          if (soldeCentimes > 0 && soldeCentimes === paiement.amountCentimes) {
            score += 20;
            raisons.push("même montant que le solde (+20)");
          }
          return {
            paiementId: paiement._id,
            helloassoPaymentId: paiement.helloassoPaymentId,
            payeurNom: paiement.payeurNom,
            payeurPrenom: paiement.payeurPrenom,
            payeurEmail: paiement.payeurEmail,
            participantNom: paiement.participantNom ?? null,
            participantPrenom: paiement.participantPrenom ?? null,
            amountCentimes: paiement.amountCentimes,
            statut: paiement.statut,
            datePaiement: paiement.datePaiement,
            suggestion: score > 0 ? { score, raisons } : null,
          };
        }),
    );
    return {
      ...paiements,
      page: disponibles.filter((paiement) => paiement !== null),
    };
  },
});

export const creerDemande = authenticatedMutation({
  args: {
    typeFormulaire: typeFormulaireValidator,
    libelle: v.string(),
    description: v.optional(v.string()),
    dateEvenement: v.optional(v.string()),
    calcul: calculValidator,
    eleveIds: v.array(v.id("abo_eleves_en_cours")),
  },
  returns: v.object({
    demandeId: v.id("remboursements_demandes"),
    reference: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    if (args.eleveIds.length === 0) erreur("Sélectionnez au moins un élève.");
    assertLimit(args.eleveIds.length, MAX_BENEFICIAIRES_PAR_DEMANDE, "Le nombre d'élèves");
    const ids = [...new Set(args.eleveIds)].sort();
    if (ids.length !== args.eleveIds.length) erreur("Un élève ne peut être sélectionné qu'une fois.");
    const libelle = texteRequis(args.libelle, "Le libellé", 160);
    const description = texteOptionnel(args.description, "La description", 2_000);
    const dateEvenement = texteOptionnel(args.dateEvenement, "La date", 32);
    if (dateEvenement && !/^\d{4}-\d{2}-\d{2}$/.test(dateEvenement)) {
      erreur("La date doit être au format AAAA-MM-JJ.");
    }
    const montant =
      args.calcul.type === "total_reparti"
        ? montantValide(args.calcul.montantTotalCentimes, "Le montant total")
        : montantValide(args.calcul.prixParPersonneCentimes, "Le prix par personne");
    if (args.calcul.type === "total_reparti" && montant < ids.length) {
      erreur("Le montant total doit permettre d'attribuer au moins un centime par élève.");
    }
    const eleves = await Promise.all(
      ids.map((id) => ctx.db.get("abo_eleves_en_cours", id)),
    );
    if (eleves.some((eleve) => eleve === null)) erreur("Au moins un élève est introuvable.");
    if (eleves.some((eleve) => estListeAttente(eleve?.horaire))) {
      erreur("Un élève en liste d'attente ne peut pas être ajouté.");
    }
    const now = new Date().toISOString();
    const reference = `REMB-${now.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const demandeId = await ctx.db.insert("remboursements_demandes", {
      reference,
      typeFormulaire: args.typeFormulaire,
      libelle,
      description,
      dateEvenement,
      calcul: args.calcul,
      statut: "active",
      createdAt: now,
      createdBy: ctx.userId,
      updatedAt: now,
      updatedBy: ctx.userId,
    });
    const quotient =
      args.calcul.type === "total_reparti"
        ? Math.floor(montant / eleves.length)
        : montant;
    const reste =
      args.calcul.type === "total_reparti" ? montant % eleves.length : 0;
    for (let index = 0; index < eleves.length; index += 1) {
      const eleve = eleves[index]!;
      await ctx.db.insert("remboursements_beneficiaires", {
        demandeId,
        sourceEleveId: eleve._id,
        nom: texteRequis(eleve.nom ?? "", "Le nom de l'élève", 120),
        prenom: texteRequis(eleve.prenom ?? "", "Le prénom de l'élève", 120),
        email: emailUniqueStrict(eleve.email_eleve, eleve.email_gestion),
        licence: eleve.licence?.trim() || eleve.licence_saisie?.trim() || undefined,
        cours: eleve.cours?.trim() || undefined,
        horaire: eleve.horaire?.trim() || undefined,
        montantDuCentimes: quotient + (index < reste ? 1 : 0),
        createdAt: now,
        createdBy: ctx.userId,
        updatedAt: now,
        updatedBy: ctx.userId,
      });
    }
    return { demandeId, reference };
  },
});

export const archiverDemande = authenticatedMutation({
  args: { demandeId: v.id("remboursements_demandes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const demande = await ctx.db.get("remboursements_demandes", args.demandeId);
    if (!demande) erreur("Demande introuvable.", "404");
    if (demande.statut === "archivee") return null;
    const beneficiaires = await getBeneficiaires(ctx, demande._id);
    for (const beneficiaire of beneficiaires) {
      const rapprochements = await ctx.db
        .query("remboursements_rapprochements")
        .withIndex("by_beneficiaireId", (q) => q.eq("beneficiaireId", beneficiaire._id))
        .take(100);
      const paiements = await Promise.all(
        rapprochements.map((r) =>
          ctx.db.get("remboursements_helloasso_paiements", r.paiementId),
        ),
      );
      const paye = paiements.reduce(
        (sum, p) => sum + (p?.statut === "authorized" ? p.amountCentimes : 0),
        0,
      );
      if (paye < beneficiaire.montantDuCentimes) {
        erreur("La demande ne peut être archivée que lorsque tous les bénéficiaires sont soldés.");
      }
    }
    const now = new Date().toISOString();
    const patch = {
      statut: "archivee" as const,
      archivedAt: now,
      archivedBy: ctx.userId,
      updatedAt: now,
      updatedBy: ctx.userId,
    };
    if (champsModifies(demande, patch, ["updatedAt"])) {
      await ctx.db.patch(demande._id, patch);
    }
    return null;
  },
});

export const restaurerDemande = authenticatedMutation({
  args: { demandeId: v.id("remboursements_demandes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const demande = await ctx.db.get("remboursements_demandes", args.demandeId);
    if (!demande) erreur("Demande introuvable.", "404");
    if (demande.statut === "active") return null;
    await ctx.db.patch(demande._id, {
      statut: "active",
      archivedAt: undefined,
      archivedBy: undefined,
      annuleeAt: undefined,
      annuleeBy: undefined,
      motifAnnulation: undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: ctx.userId,
    });
    return null;
  },
});

export const annulerDemande = authenticatedMutation({
  args: {
    demandeId: v.id("remboursements_demandes"),
    motif: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const demande = await ctx.db.get("remboursements_demandes", args.demandeId);
    if (!demande) erreur("Demande introuvable.", "404");
    if (demande.statut !== "active") {
      erreur("Seule une demande active peut être annulée.");
    }
    const now = new Date().toISOString();
    await ctx.db.patch(demande._id, {
      statut: "archivee",
      archivedAt: now,
      archivedBy: ctx.userId,
      annuleeAt: now,
      annuleeBy: ctx.userId,
      motifAnnulation: texteRequis(args.motif, "Le motif d'annulation", 500),
      updatedAt: now,
      updatedBy: ctx.userId,
    });
    return null;
  },
});

export const rapprocherPaiement = authenticatedMutation({
  args: {
    beneficiaireId: v.id("remboursements_beneficiaires"),
    paiementId: v.id("remboursements_helloasso_paiements"),
  },
  returns: v.id("remboursements_rapprochements"),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const [beneficiaire, paiement] = await Promise.all([
      ctx.db.get("remboursements_beneficiaires", args.beneficiaireId),
      ctx.db.get("remboursements_helloasso_paiements", args.paiementId),
    ]);
    if (!beneficiaire || !paiement) erreur("Bénéficiaire ou paiement introuvable.", "404");
    const demande = await ctx.db.get("remboursements_demandes", beneficiaire.demandeId);
    if (!demande) erreur("Demande introuvable.", "404");
    if (demande.statut !== "active") erreur("Une demande archivée ne peut pas être modifiée.");
    if (demande.typeFormulaire !== paiement.typeFormulaire) {
      erreur("Le paiement ne provient pas du formulaire correspondant à la demande.");
    }
    if (paiement.statut !== "authorized") {
      erreur("Seul un paiement autorisé peut être rapproché.");
    }
    const existant = await ctx.db
      .query("remboursements_rapprochements")
      .withIndex("by_paiementId", (q) => q.eq("paiementId", paiement._id))
      .first();
    if (existant) erreur("Ce paiement est déjà rapproché.");
    const rapprochementsBeneficiaire = await ctx.db
      .query("remboursements_rapprochements")
      .withIndex("by_beneficiaireId", (q) =>
        q.eq("beneficiaireId", beneficiaire._id),
      )
      .take(100);
    const paiementsDejaLies = await Promise.all(
      rapprochementsBeneficiaire.map((rapprochement) =>
        ctx.db.get(
          "remboursements_helloasso_paiements",
          rapprochement.paiementId,
        ),
      ),
    );
    const dejaPayeCentimes = paiementsDejaLies.reduce(
      (total, paiementLie) =>
        total +
        (paiementLie?.statut === "authorized" ? paiementLie.amountCentimes : 0),
      0,
    );
    const soldeCentimes = beneficiaire.montantDuCentimes - dejaPayeCentimes;
    if (soldeCentimes <= 0) {
      erreur("Ce bénéficiaire est déjà soldé.");
    }
    if (paiement.amountCentimes > soldeCentimes) {
      erreur("Le montant du paiement dépasse le solde restant du bénéficiaire.");
    }
    return await ctx.db.insert("remboursements_rapprochements", {
      beneficiaireId: beneficiaire._id,
      paiementId: paiement._id,
      rapprocheAt: new Date().toISOString(),
      rapprocheBy: ctx.userId,
    });
  },
});

export const annulerRapprochement = authenticatedMutation({
  args: { rapprochementId: v.id("remboursements_rapprochements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const rapprochement = await ctx.db.get(
      "remboursements_rapprochements",
      args.rapprochementId,
    );
    if (!rapprochement) erreur("Rapprochement introuvable.", "404");
    const beneficiaire = await ctx.db.get(
      "remboursements_beneficiaires",
      rapprochement.beneficiaireId,
    );
    const demande = beneficiaire
      ? await ctx.db.get("remboursements_demandes", beneficiaire.demandeId)
      : null;
    if (!demande) erreur("Demande introuvable.", "404");
    if (demande.statut !== "active") erreur("Une demande archivée ne peut pas être modifiée.");
    await ctx.db.delete("remboursements_rapprochements", rapprochement._id);
    return null;
  },
});

export const journaliserEmail = authenticatedMutation({
  args: {
    demandeId: v.id("remboursements_demandes"),
    beneficiaireId: v.id("remboursements_beneficiaires"),
    typeEmail: v.union(v.literal("initial"), v.literal("relance")),
  },
  returns: v.id("remboursements_email_log"),
  handler: async (ctx, args) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    const [demande, beneficiaire] = await Promise.all([
      ctx.db.get("remboursements_demandes", args.demandeId),
      ctx.db.get("remboursements_beneficiaires", args.beneficiaireId),
    ]);
    if (!demande || !beneficiaire) {
      erreur("Demande ou bénéficiaire introuvable.", "404");
    }
    if (demande.statut !== "active") {
      erreur("Un e-mail ne peut être préparé que pour une demande active.");
    }
    if (beneficiaire.demandeId !== demande._id) {
      erreur("Le bénéficiaire n'appartient pas à cette demande.");
    }
    const destinataire = emailUniqueStrict(beneficiaire.email);
    if (!destinataire) {
      erreur("Le bénéficiaire ne possède pas d'adresse e-mail valide.");
    }
    const now = Date.now();
    const recents = await ctx.db
      .query("remboursements_email_log")
      .withIndex("by_beneficiaireId", (q) =>
        q.eq("beneficiaireId", beneficiaire._id),
      )
      .order("desc")
      .take(10);
    const doublon = recents.find(
      (log) =>
        log.demandeId === demande._id &&
        log.typeEmail === args.typeEmail &&
        now - Date.parse(log.preparedAt) >= 0 &&
        now - Date.parse(log.preparedAt) < 10_000,
    );
    if (doublon) {
      return doublon._id;
    }
    return await ctx.db.insert("remboursements_email_log", {
      demandeId: demande._id,
      beneficiaireId: beneficiaire._id,
      typeEmail: args.typeEmail,
      destinataire,
      preparedAt: new Date(now).toISOString(),
      preparedBy: ctx.userId,
    });
  },
});

// Garde applicative appelée par l'action de synchronisation. L'identité est
// dérivée à nouveau par authenticatedQuery, sans accepter d'identifiant client.
export const verifierAccesSynchronisation = authenticatedQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "remboursements_eleves");
    return null;
  },
});
