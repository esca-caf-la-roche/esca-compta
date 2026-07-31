// Synchronisation à la demande des deux formulaires fixes de remboursements.
// Aucun payload HelloAsso brut ni secret n'est conservé ou renvoyé au client.

import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authenticatedAction } from "./customFunctions";
import { champsModifies } from "./dbUtils";

const TOKEN_URL = "https://api.helloasso.com/oauth2/token";
const API_BASE = "https://api.helloasso.com/v5";
const ORGANISATION = "caf-la-roche-bonneville";
const SYNC_KEY = "last_sync_remboursements_helloasso";
const SYNC_ELEVES_KEY = "last_sync_eleves";
const PURGE_CURSOR_PREFIX = "remboursements_purge_cursor_";
const TTL_MS = 60 * 60_000;
const BATCH_SIZE = 100;
const PURGE_BATCH_SIZE = 100;
const MAX_PURGE_BATCHES_PAR_FORMULAIRE = 10;
const MAX_PAGES_PAR_FORMULAIRE = 100;

const FORMULAIRES = [
  {
    typeFormulaire: "competition" as const,
    url: "https://www.helloasso.com/associations/caf-la-roche-bonneville/paiements/esc07-remboursement-inscriptions-competition",
    slug: "esc07-remboursement-inscriptions-competition",
  },
  {
    typeFormulaire: "stage" as const,
    url: "https://www.helloasso.com/associations/caf-la-roche-bonneville/paiements/esc11-remboursement-stage",
    slug: "esc11-remboursement-stage",
  },
] as const;

type TypeFormulaire = (typeof FORMULAIRES)[number]["typeFormulaire"];
type Statut =
  | "authorized"
  | "pending"
  | "refused"
  | "canceled"
  | "refunded"
  | "unknown";

type PaiementNormalise = {
  typeFormulaire: TypeFormulaire;
  helloassoPaymentId: string;
  payeurNom: string;
  payeurPrenom: string;
  payeurEmail: string;
  participantNom?: string;
  participantPrenom?: string;
  participantEmail?: string;
  amountCentimes: number;
  statut: Statut;
  datePaiement: string;
  syncedAt: string;
};
type ResultatSynchronisation = {
  statut: "done" | "skipped" | "erreur";
  statutEleves: "done" | "skipped" | "erreur";
  lastSyncAt: string | null;
  nombrePaiements: number;
};
type ResultatPurge = {
  supprimes: number;
  continueCursor: string;
  isDone: boolean;
};

const paiementValidator = v.object({
  typeFormulaire: v.union(v.literal("competition"), v.literal("stage")),
  helloassoPaymentId: v.string(),
  payeurNom: v.string(),
  payeurPrenom: v.string(),
  payeurEmail: v.string(),
  participantNom: v.optional(v.string()),
  participantPrenom: v.optional(v.string()),
  participantEmail: v.optional(v.string()),
  amountCentimes: v.number(),
  statut: v.union(
    v.literal("authorized"),
    v.literal("pending"),
    v.literal("refused"),
    v.literal("canceled"),
    v.literal("refunded"),
    v.literal("unknown"),
  ),
  datePaiement: v.string(),
  syncedAt: v.string(),
});

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function statutBase(value: unknown): Statut {
  switch ((string(value) ?? "").toLocaleLowerCase("en")) {
    case "authorized":
      return "authorized";
    case "pending":
      return "pending";
    case "refused":
      return "refused";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "refunded":
      return "refunded";
    default:
      return "unknown";
  }
}

function montantRembourseCentimes(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, raw) => {
    const amount = record(raw).amount;
    return total + (Number.isSafeInteger(amount) && (amount as number) > 0
      ? (amount as number)
      : 0);
  }, 0);
}

function normaliserPaiement(
  raw: unknown,
  typeFormulaire: TypeFormulaire,
  syncedAt: string,
): PaiementNormalise | null {
  const payment = record(raw);
  const id = payment.id;
  const amount = payment.amount;
  const datePaiement = string(payment.date);
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    !Number.isSafeInteger(amount) ||
    (amount as number) < 0 ||
    !datePaiement ||
    !Number.isFinite(Date.parse(datePaiement))
  ) {
    return null;
  }
  const order = record(payment.order);
  const payer = {
    ...record(order.payer),
    ...record(payment.payer),
  };
  const firstItem = Array.isArray(payment.items) ? record(payment.items[0]) : {};
  const participant = record(firstItem.user);
  const montantBrutCentimes = amount as number;
  const montantRembourse = montantRembourseCentimes(payment.refundOperations);
  const amountCentimes = Math.max(0, montantBrutCentimes - montantRembourse);
  const base = statutBase(payment.state);
  const statutNormalise =
    amountCentimes <= 0 && montantRembourse > 0
      ? "refunded"
      : montantRembourse > 0 && base === "refunded"
        ? "authorized"
        : base;
  return {
    typeFormulaire,
    helloassoPaymentId: String(id),
    payeurNom: string(payer.lastName) ?? "",
    payeurPrenom: string(payer.firstName) ?? "",
    payeurEmail: string(payer.email)?.toLocaleLowerCase("fr") ?? "",
    participantNom: string(participant.lastName),
    participantPrenom: string(participant.firstName),
    participantEmail: string(participant.email)?.toLocaleLowerCase("fr"),
    amountCentimes,
    statut: statutNormalise,
    datePaiement,
    syncedAt,
  };
}

async function obtenirToken(): Promise<string> {
  const clientId = process.env.HELLOASSO_CLIENT_ID;
  const clientSecret = process.env.HELLOASSO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ConvexError("La configuration HelloAsso est incomplète.");
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    throw new ConvexError("L'authentification auprès de HelloAsso a échoué.");
  }
  const body = record(await response.json());
  const token = string(body.access_token);
  if (!token) throw new ConvexError("HelloAsso n'a pas fourni de jeton exploitable.");
  return token;
}

async function chargerFormulaire(
  token: string,
  formulaire: (typeof FORMULAIRES)[number],
  syncedAt: string,
  cutoff: string,
): Promise<PaiementNormalise[]> {
  // Vérification défensive : les URLs métier sont fixes et correspondent aux
  // slugs utilisés avec l'API PaymentForm v5.
  if (!formulaire.url.endsWith(`/paiements/${formulaire.slug}`)) {
    throw new ConvexError("La configuration du formulaire HelloAsso est invalide.");
  }
  const paiements: PaiementNormalise[] = [];
  let continuationToken: string | undefined;
  for (let page = 0; page < MAX_PAGES_PAR_FORMULAIRE; page += 1) {
    const url = new URL(
      `${API_BASE}/organizations/${ORGANISATION}/forms/PaymentForm/${formulaire.slug}/payments`,
    );
    url.searchParams.set("pageSize", "100");
    // L'API HelloAsso applique le filtre `from` côté serveur. On évite ainsi
    // de reparcourir tout l'historique des formulaires à chaque ouverture.
    url.searchParams.set("from", cutoff);
    url.searchParams.set("sortField", "Date");
    url.searchParams.set("sortOrder", "Desc");
    if (continuationToken) url.searchParams.set("continuationToken", continuationToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new ConvexError(`La lecture du formulaire ${formulaire.typeFormulaire} a échoué.`);
    }
    const body = record(await response.json());
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const row of rows) {
      const normalise = normaliserPaiement(row, formulaire.typeFormulaire, syncedAt);
      if (normalise && Date.parse(normalise.datePaiement) >= Date.parse(cutoff)) {
        paiements.push(normalise);
      }
    }
    continuationToken = string(record(body.pagination).continuationToken);
    if (!continuationToken || rows.length === 0) return paiements;
  }
  throw new ConvexError(`Le formulaire ${formulaire.typeFormulaire} dépasse la limite de pagination.`);
}

export const upsertPaiements = internalMutation({
  args: { paiements: v.array(paiementValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    let traites = 0;
    for (const paiement of args.paiements) {
      const existing = await ctx.db
        .query("remboursements_helloasso_paiements")
        .withIndex("by_helloassoPaymentId", (q) =>
          q.eq("helloassoPaymentId", paiement.helloassoPaymentId),
        )
        .first();
      if (existing) {
        if (existing.typeFormulaire !== paiement.typeFormulaire) {
          throw new ConvexError("Un identifiant de paiement HelloAsso existe sur deux formulaires.");
        }
        if (champsModifies(existing, paiement, ["syncedAt"])) {
          await ctx.db.patch(existing._id, paiement);
        }
      } else {
        await ctx.db.insert("remboursements_helloasso_paiements", paiement);
      }
      traites += 1;
    }
    return traites;
  },
});

export const purgerPaiementsExpires = internalMutation({
  args: {
    typeFormulaire: v.union(v.literal("competition"), v.literal("stage")),
    cutoff: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    supprimes: v.number(),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args): Promise<ResultatPurge> => {
    const result = await ctx.db
      .query("remboursements_helloasso_paiements")
      .withIndex("by_typeFormulaire_and_datePaiement", (q) =>
        q
          .eq("typeFormulaire", args.typeFormulaire)
          .lt("datePaiement", args.cutoff),
      )
      .paginate({
        numItems: PURGE_BATCH_SIZE,
        cursor: args.cursor,
      });
    let supprimes = 0;
    for (const paiement of result.page) {
      const rapprochement = await ctx.db
        .query("remboursements_rapprochements")
        .withIndex("by_paiementId", (q) => q.eq("paiementId", paiement._id))
        .first();
      if (!rapprochement && !paiement.archivedAt) {
        await ctx.db.delete(
          "remboursements_helloasso_paiements",
          paiement._id,
        );
        supprimes += 1;
      }
    }
    return {
      supprimes,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getLastSyncAt = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx): Promise<string | null> => {
    const row = await ctx.db
      .query("abo_app_config")
      .withIndex("by_cle", (q) => q.eq("cle", SYNC_KEY))
      .first();
    return row?.valeur ?? null;
  },
});

export const getPurgeCursor = internalQuery({
  args: {
    typeFormulaire: v.union(v.literal("competition"), v.literal("stage")),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const row = await ctx.db
      .query("abo_app_config")
      .withIndex("by_cle", (q) =>
        q.eq("cle", `${PURGE_CURSOR_PREFIX}${args.typeFormulaire}`),
      )
      .first();
    return row?.valeur ?? null;
  },
});

export const setPurgeCursor = internalMutation({
  args: {
    typeFormulaire: v.union(v.literal("competition"), v.literal("stage")),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cle = `${PURGE_CURSOR_PREFIX}${args.typeFormulaire}`;
    const row = await ctx.db
      .query("abo_app_config")
      .withIndex("by_cle", (q) => q.eq("cle", cle))
      .first();
    const updatedAt = new Date().toISOString();
    if (row) {
      if (row.valeur !== args.cursor) {
        await ctx.db.patch(row._id, {
          valeur: args.cursor,
          updated_at: updatedAt,
        });
      }
    } else if (args.cursor !== undefined) {
      await ctx.db.insert("abo_app_config", {
        cle,
        valeur: args.cursor,
        updated_at: updatedAt,
      });
    }
    return null;
  },
});

async function synchroniserEleves(
  ctx: ActionCtx,
): Promise<"done" | "skipped" | "erreur"> {
  let reservation: { proceed: boolean; precedent?: string } | undefined;
  try {
    reservation = await ctx.runMutation(internal.abo.sync.reserverSync, {
      cle: SYNC_ELEVES_KEY,
      ttlMs: TTL_MS,
    });
    if (!reservation.proceed) return "skipped";
    await ctx.runAction(internal.abo.scrap.importerElevesEnCours, {});
    return "done";
  } catch (cause) {
    if (reservation?.proceed) {
      await ctx.runMutation(internal.abo.sync.restaurerMarqueur, {
        cle: SYNC_ELEVES_KEY,
        valeur: reservation.precedent,
      });
    }
    console.error(
      "[remboursements] échec de synchronisation des élèves",
      cause instanceof Error ? cause.message : "cause inconnue",
    );
    return "erreur";
  }
}

async function purgerCacheExpire(ctx: ActionCtx, cutoff: string): Promise<void> {
  for (const formulaire of FORMULAIRES) {
    let cursor: string | null = await ctx.runQuery(
      internal.remboursementsHelloAsso.getPurgeCursor,
      { typeFormulaire: formulaire.typeFormulaire },
    );
    for (
      let batch = 0;
      batch < MAX_PURGE_BATCHES_PAR_FORMULAIRE;
      batch += 1
    ) {
      const result: ResultatPurge = await ctx.runMutation(
        internal.remboursementsHelloAsso.purgerPaiementsExpires,
        {
          typeFormulaire: formulaire.typeFormulaire,
          cutoff,
          cursor,
        },
      );
      if (result.isDone) {
        await ctx.runMutation(
          internal.remboursementsHelloAsso.setPurgeCursor,
          {
            typeFormulaire: formulaire.typeFormulaire,
            cursor: undefined,
          },
        );
        break;
      }
      cursor = result.continueCursor;
      await ctx.runMutation(
        internal.remboursementsHelloAsso.setPurgeCursor,
        {
          typeFormulaire: formulaire.typeFormulaire,
          cursor,
        },
      );
    }
  }
}

export const synchroniser = authenticatedAction({
  args: {},
  returns: v.object({
    statut: v.union(v.literal("done"), v.literal("skipped"), v.literal("erreur")),
    statutEleves: v.union(
      v.literal("done"),
      v.literal("skipped"),
      v.literal("erreur"),
    ),
    lastSyncAt: v.union(v.string(), v.null()),
    nombrePaiements: v.number(),
  }),
  handler: async (ctx): Promise<ResultatSynchronisation> => {
    await ctx.runQuery(api.remboursements.verifierAccesSynchronisation, {});
    // Les deux sources sont indépendantes : l'échec du snapshot élèves ne
    // bloque jamais la mise à jour du cache HelloAsso, et réciproquement.
    const statutElevesPromise = synchroniserEleves(ctx);
    const reservation: { proceed: boolean; precedent?: string } =
      await ctx.runMutation(internal.abo.sync.reserverSync, {
        cle: SYNC_KEY,
        ttlMs: TTL_MS,
      });
    if (!reservation.proceed) {
      return {
        statut: "skipped" as const,
        statutEleves: await statutElevesPromise,
        lastSyncAt: reservation.precedent ?? null,
        nombrePaiements: 0,
      };
    }
    try {
      const token = await obtenirToken();
      const syncedAt = new Date().toISOString();
      const cutoffDate = new Date(syncedAt);
      cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - 24);
      const cutoff = cutoffDate.toISOString();
      const paiements = (
        await Promise.all(
          FORMULAIRES.map((formulaire) =>
            chargerFormulaire(token, formulaire, syncedAt, cutoff),
          ),
        )
      ).flat();
      let nombrePaiements = 0;
      for (let index = 0; index < paiements.length; index += BATCH_SIZE) {
        const nombre: number = await ctx.runMutation(
          internal.remboursementsHelloAsso.upsertPaiements,
          { paiements: paiements.slice(index, index + BATCH_SIZE) },
        );
        nombrePaiements += nombre;
      }
      await purgerCacheExpire(ctx, cutoff);
      const lastSyncAt: string | null = await ctx.runQuery(
        internal.remboursementsHelloAsso.getLastSyncAt,
        {},
      );
      return {
        statut: "done" as const,
        statutEleves: await statutElevesPromise,
        lastSyncAt,
        nombrePaiements,
      };
    } catch (cause) {
      await ctx.runMutation(internal.abo.sync.restaurerMarqueur, {
        cle: SYNC_KEY,
        valeur: reservation.precedent,
      });
      console.error(
        "[remboursements] échec de synchronisation HelloAsso",
        cause instanceof Error ? cause.message : "cause inconnue",
      );
      const lastSyncAt: string | null = await ctx.runQuery(
        internal.remboursementsHelloAsso.getLastSyncAt,
        {},
      );
      return {
        statut: "erreur" as const,
        statutEleves: await statutElevesPromise,
        lastSyncAt,
        nombrePaiements: 0,
      };
    }
  },
});
