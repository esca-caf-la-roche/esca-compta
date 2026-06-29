// ─────────────────────────────────────────────────────────────────────────────
// Migration ponctuelle : Supabase → Convex
//
// Lit directement la base Supabase via son API REST (clé service_role qui
// contourne les RLS), remappe les clés étrangères (UUID Supabase → Id Convex)
// et insère dans les tables paiements.
//
// Pré-requis (variables d'env sur le déploiement Convex) :
//   SUPABASE_SERVICE_ROLE_KEY   (Dashboard Supabase → Settings → API)
//   SUPABASE_URL                (par défaut : projet tnvhqkwopxvqofmmoflo)
//
// Lancement :
//   npx convex run importMigration:runImport            (dev)
//   npx convex run importMigration:runImport --prod     (production)
//
// ⚠️ Module temporaire — à supprimer après la migration.
// ─────────────────────────────────────────────────────────────────────────────

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DEFAULT_SUPABASE_URL = "https://tnvhqkwopxvqofmmoflo.supabase.co";

// responsibles.id (UUID Supabase) → email (récupéré depuis auth.users)
const RESPONSIBLE_EMAIL: Record<string, string> = {
  "ca7f6e2e-20df-4d92-95de-c9e4dcad75ab": "j.duheron@caflarochebonneville.fr",
  "15cda5ca-dd66-4c92-be3a-cf6c7df00219": "escalade@caflarochebonneville.fr",
  "306e87d6-d0a1-47dd-a901-670f0fe1fc46": "coursescalade@caflarochebonneville.fr",
};

// ─── Query : utilisateurs Convex (pour mapper par email) ────────────────────────

export const usersByEmail = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ id: u._id, email: u.email ?? null, name: u.name ?? null }));
  },
});

// ─── Diagnostic : utilisateurs & comptes auth ───────────────────────────────────

export const inspectUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const accounts = await ctx.db.query("authAccounts").collect();
    const settings = await ctx.db.query("userSettings").collect();
    return {
      users: users.map((u) => ({
        id: u._id,
        email: (u as any).email ?? null,
        name: (u as any).name ?? null,
      })),
      authAccounts: accounts.map((a) => ({
        userId: (a as any).userId,
        provider: (a as any).provider,
        providerAccountId: (a as any).providerAccountId,
      })),
      userSettings: settings.map((s) => ({
        userId: s.userId,
        role: s.role,
        allowedTiles: s.allowedTiles,
      })),
    };
  },
});

// ─── Vérification d'intégrité post-import ───────────────────────────────────────

export const verify = internalQuery({
  args: {},
  handler: async (ctx) => {
    const dossiers = await ctx.db.query("dossiers").collect();
    const txs = await ctx.db.query("helloasso_transactions").collect();
    const links = await ctx.db.query("helloasso_links").collect();
    const groupLinks = await ctx.db.query("group_links").collect();

    const dossierIds = new Set(dossiers.map((d) => d.dossier_id));
    const linkIds = new Set(links.map((l) => l._id));

    const orphanTx = txs.filter((t) => !dossierIds.has(t.dossier_id)).length;
    const orphanDossiers = dossiers.filter(
      (d) => !linkIds.has(d.helloasso_link_id)
    ).length;
    const orphanGroupLinks = groupLinks.filter(
      (gl) => !linkIds.has(gl.link_id)
    ).length;

    const withResponsible = links.filter((l) => l.responsible_id).length;
    const withStatus = dossiers.filter((d) => d.local_status).length;

    const statusMap = new Map<string, number>();
    for (const d of dossiers) {
      const k = d.local_status ?? "À traiter";
      statusMap.set(k, (statusMap.get(k) ?? 0) + 1);
    }
    const statusCounts = [...statusMap.entries()].map(([status, count]) => ({
      status,
      count,
    }));

    return {
      dossiers: dossiers.length,
      transactions: txs.length,
      orphanTransactions: orphanTx,
      orphanDossiers,
      orphanGroupLinks,
      linksWithResponsible: `${withResponsible}/${links.length}`,
      dossiersWithLocalStatus: withStatus,
      statusCounts,
    };
  },
});

// ─── Mutations d'insertion (reçoivent des FK déjà remappées) ────────────────────

export const clearPayments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "dossiers",
      "helloasso_transactions",
      "group_links",
      "groups",
      "helloasso_links",
      "approved_students",
      "waiting_students",
    ] as const;
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
  },
});

export const insertLinks = internalMutation({
  args: {
    rows: v.array(
      v.object({
        old_id: v.string(),
        url: v.string(),
        label: v.string(),
        is_installment: v.boolean(),
        responsible_id: v.optional(v.id("users")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const map: { old_id: string; id: Id<"helloasso_links"> }[] = [];
    for (const r of args.rows) {
      const id = await ctx.db.insert("helloasso_links", {
        url: r.url,
        label: r.label,
        is_installment: r.is_installment,
        responsible_id: r.responsible_id,
      });
      map.push({ old_id: r.old_id, id });
    }
    return map;
  },
});

export const insertGroups = internalMutation({
  args: {
    rows: v.array(
      v.object({
        old_id: v.string(),
        name: v.string(),
        requires_approval: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const map: { old_id: string; id: Id<"groups"> }[] = [];
    for (const r of args.rows) {
      const id = await ctx.db.insert("groups", {
        name: r.name,
        requires_approval: r.requires_approval,
      });
      map.push({ old_id: r.old_id, id });
    }
    return map;
  },
});

export const insertGroupLinks = internalMutation({
  args: {
    rows: v.array(
      v.object({
        group_id: v.id("groups"),
        link_id: v.id("helloasso_links"),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const r of args.rows) {
      await ctx.db.insert("group_links", r);
    }
    return args.rows.length;
  },
});

export const insertDossiers = internalMutation({
  args: {
    rows: v.array(
      v.object({
        dossier_id: v.string(),
        helloasso_link_id: v.id("helloasso_links"),
        first_name: v.string(),
        last_name: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        payer_first_name: v.string(),
        payer_last_name: v.string(),
        payer_email: v.string(),
        total_amount: v.number(),
        local_status: v.optional(v.string()),
        comment: v.optional(v.string()),
        updated_by: v.optional(v.id("users")),
        updated_at: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("dossiers", r);
    return args.rows.length;
  },
});

export const insertTransactions = internalMutation({
  args: {
    rows: v.array(
      v.object({
        helloasso_payment_id: v.string(),
        dossier_id: v.string(),
        amount: v.number(),
        payment_date: v.string(),
        helloasso_status: v.string(),
        synced_at: v.string(),
        payment_receipt_url: v.optional(v.string()),
        fiscal_receipt_url: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("helloasso_transactions", r);
    return args.rows.length;
  },
});

export const insertApproved = internalMutation({
  args: {
    rows: v.array(
      v.object({
        first_name: v.string(),
        last_name: v.string(),
        email: v.string(),
        group_id: v.id("groups"),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("approved_students", r);
    return args.rows.length;
  },
});

export const insertWaiting = internalMutation({
  args: {
    rows: v.array(
      v.object({
        first_name: v.string(),
        last_name: v.string(),
        email: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const r of args.rows) await ctx.db.insert("waiting_students", r);
    return args.rows.length;
  },
});

// ─── Helpers de fetch Supabase ──────────────────────────────────────────────────

async function fetchTable(
  baseUrl: string,
  key: string,
  table: string,
  select: string
): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  // Pagination via header Range jusqu'à épuisement
  for (;;) {
    const url = `${baseUrl}/rest/v1/${table}?select=${select}`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase ${table} (${res.status}): ${body.slice(0, 300)}`);
    }
    const batch = (await res.json()) as any[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ─── Action principale ──────────────────────────────────────────────────────────

export const runImport = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<any> => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const baseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    if (!key) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY manquante. Définis-la avec `npx convex env set`."
      );
    }

    // 1) Lecture Supabase
    const [
      sbLinks,
      sbGroups,
      sbGroupLinks,
      sbDossiers,
      sbTransactions,
      sbApproved,
      sbWaiting,
    ] = await Promise.all([
      fetchTable(baseUrl, key, "helloasso_links", "id,url,label,is_installment,responsible_id"),
      fetchTable(baseUrl, key, "groups", "id,name,requires_approval"),
      fetchTable(baseUrl, key, "group_links", "group_id,link_id"),
      fetchTable(
        baseUrl,
        key,
        "dossiers",
        "id,helloasso_link_id,first_name,last_name,email,phone,payer_first_name,payer_last_name,payer_email,total_amount,local_status,comment,updated_by,updated_at"
      ),
      fetchTable(
        baseUrl,
        key,
        "helloasso_transactions",
        "helloasso_payment_id,dossier_id,amount,payment_date,helloasso_status,synced_at,payment_receipt_url,fiscal_receipt_url"
      ),
      fetchTable(baseUrl, key, "approved_students", "first_name,last_name,email,group_id"),
      fetchTable(baseUrl, key, "waiting_students", "first_name,last_name,email"),
    ]);

    // 2) Map email → userId Convex
    const users = await ctx.runQuery(internal.importMigration.usersByEmail, {});
    const emailToUser = new Map<string, Id<"users">>();
    for (const u of users) {
      if (u.email) emailToUser.set(u.email.toLowerCase(), u.id);
    }
    const resolveResponsible = (uuid: string | null): Id<"users"> | undefined => {
      if (!uuid) return undefined;
      const email = RESPONSIBLE_EMAIL[uuid]?.toLowerCase();
      if (!email) return undefined;
      return emailToUser.get(email);
    };

    // Diagnostic du mapping responsables
    const responsibleReport = Object.values(RESPONSIBLE_EMAIL).map((email) => ({
      email,
      matched: emailToUser.has(email.toLowerCase()),
    }));

    if (args.dryRun) {
      return {
        dryRun: true,
        counts: {
          links: sbLinks.length,
          groups: sbGroups.length,
          group_links: sbGroupLinks.length,
          dossiers: sbDossiers.length,
          transactions: sbTransactions.length,
          approved: sbApproved.length,
          waiting: sbWaiting.length,
        },
        convexUsers: users.map((u) => u.email),
        responsibleReport,
      };
    }

    // 3) Purge + insertion
    await ctx.runMutation(internal.importMigration.clearPayments, {});

    // Links
    const linkMapArr = await ctx.runMutation(internal.importMigration.insertLinks, {
      rows: sbLinks.map((l) => ({
        old_id: String(l.id),
        url: l.url,
        label: l.label,
        is_installment: !!l.is_installment,
        responsible_id: resolveResponsible(l.responsible_id),
      })),
    });
    const linkMap = new Map(linkMapArr.map((m) => [m.old_id, m.id]));

    // Groups
    const groupMapArr = await ctx.runMutation(internal.importMigration.insertGroups, {
      rows: sbGroups.map((g) => ({
        old_id: String(g.id),
        name: g.name,
        requires_approval: !!g.requires_approval,
      })),
    });
    const groupMap = new Map(groupMapArr.map((m) => [m.old_id, m.id]));

    // Group links
    const glRows = sbGroupLinks
      .map((gl) => {
        const group_id = groupMap.get(String(gl.group_id));
        const link_id = linkMap.get(String(gl.link_id));
        return group_id && link_id ? { group_id, link_id } : null;
      })
      .filter((x): x is { group_id: Id<"groups">; link_id: Id<"helloasso_links"> } => x !== null);
    await ctx.runMutation(internal.importMigration.insertGroupLinks, { rows: glRows });

    // Dossiers (chunks)
    const skippedDossiers: string[] = [];
    const dossierRows = sbDossiers
      .map((d) => {
        const helloasso_link_id = linkMap.get(String(d.helloasso_link_id));
        if (!helloasso_link_id) {
          skippedDossiers.push(String(d.id));
          return null;
        }
        return {
          dossier_id: String(d.id),
          helloasso_link_id,
          first_name: d.first_name ?? "",
          last_name: d.last_name ?? "",
          email: d.email ?? undefined,
          phone: d.phone ?? undefined,
          payer_first_name: d.payer_first_name ?? "",
          payer_last_name: d.payer_last_name ?? "",
          payer_email: d.payer_email ?? "",
          total_amount: Number(d.total_amount ?? 0),
          local_status: d.local_status ?? undefined,
          comment: d.comment ?? undefined,
          updated_by: resolveResponsible(d.updated_by),
          updated_at: d.updated_at ?? undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const CHUNK = 100;
    let dossiersInserted = 0;
    for (let i = 0; i < dossierRows.length; i += CHUNK) {
      dossiersInserted += await ctx.runMutation(internal.importMigration.insertDossiers, {
        rows: dossierRows.slice(i, i + CHUNK),
      });
    }

    // Transactions (chunks)
    const txRows = sbTransactions.map((t) => ({
      helloasso_payment_id: String(t.helloasso_payment_id),
      dossier_id: String(t.dossier_id),
      amount: Number(t.amount ?? 0),
      payment_date: t.payment_date,
      helloasso_status: t.helloasso_status ?? "",
      synced_at: t.synced_at ?? new Date().toISOString(),
      payment_receipt_url: t.payment_receipt_url ?? undefined,
      fiscal_receipt_url: t.fiscal_receipt_url ?? undefined,
    }));
    let txInserted = 0;
    for (let i = 0; i < txRows.length; i += CHUNK) {
      txInserted += await ctx.runMutation(internal.importMigration.insertTransactions, {
        rows: txRows.slice(i, i + CHUNK),
      });
    }

    // Approved students
    const approvedRows = sbApproved
      .map((s) => {
        const group_id = groupMap.get(String(s.group_id));
        return group_id
          ? {
              first_name: s.first_name ?? "",
              last_name: s.last_name ?? "",
              email: s.email ?? "",
              group_id,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    await ctx.runMutation(internal.importMigration.insertApproved, { rows: approvedRows });

    // Waiting students
    await ctx.runMutation(internal.importMigration.insertWaiting, {
      rows: sbWaiting.map((s) => ({
        first_name: s.first_name ?? "",
        last_name: s.last_name ?? "",
        email: s.email ?? "",
      })),
    });

    return {
      dryRun: false,
      inserted: {
        links: linkMapArr.length,
        groups: groupMapArr.length,
        group_links: glRows.length,
        dossiers: dossiersInserted,
        transactions: txInserted,
        approved: approvedRows.length,
        waiting: sbWaiting.length,
      },
      skippedDossiers,
      responsibleReport,
    };
  },
});
