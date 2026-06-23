import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authenticatedAction } from "./customFunctions";
import { internal } from "./_generated/api";

// --- HELPERS ---
const HA_TOKEN_URL = 'https://api.helloasso.com/oauth2/token';
const HA_API_BASE  = 'https://api.helloasso.com/v5';

const FORM_TYPE_MAP: Record<string, string> = {
  evenements: 'Event',
  adhesions:  'Membership',
  collectes:  'CrowdFunding',
  boutiques:  'Shop',
  paiements:  'PaymentForm',
};

function parseHaUrl(raw: string): { orgSlug: string; formType: string; formSlug: string } | null {
  try {
    const url   = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4 || parts[0] !== 'associations') return null;
    const orgSlug  = parts[1];
    const formType = FORM_TYPE_MAP[parts[2]];
    const formSlug = parts[3];
    if (!formType || !formSlug) return null;
    return { orgSlug, formType, formSlug };
  } catch {
    return null;
  }
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(HA_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HelloAsso token (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json as any).access_token as string;
}

async function fetchAllPayments(
  token:   string,
  orgSlug: string,
  formType: string,
  formSlug: string,
): Promise<any[]> {
  const all: any[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const url = new URL(`${HA_API_BASE}/organizations/${orgSlug}/forms/${formType}/${formSlug}/payments`);
    url.searchParams.set('pageSize', '100');
    if (continuationToken) {
      url.searchParams.set('continuationToken', continuationToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HelloAsso payments [${formSlug}] (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = await res.json() as any;
    
    if (!json.data || json.data.length === 0) {
      break;
    }
    
    const validPayments = json.data.filter((p: any) => p.state !== 'Refused' && p.state !== 'Canceled');
    all.push(...validPayments);
    
    continuationToken = json.pagination?.continuationToken;
  } while (continuationToken);

  return all;
}

function extractPhone(items?: any[]): string | null {
  if (!items?.length) return null;
  for (const item of items) {
    for (const cf of item.customFields ?? []) {
      const name = cf.name.toLowerCase();
      if ((name.includes('téléphone') || name.includes('telephone') || name.includes('phone') || name.includes('mobile') || name.includes('portable')) && cf.answer) {
        return cf.answer;
      }
    }
  }
  return null;
}


// --- MUTATION INTERNE POUR UPSERT ---
export const upsertRegistrants = internalMutation({
  args: {
    registrants: v.array(v.object({
      helloasso_payment_id: v.string(),
      helloasso_link_id: v.id("helloasso_links"),
      first_name: v.string(),
      last_name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      payer_first_name: v.string(),
      payer_last_name: v.string(),
      payer_email: v.string(),
      payment_date: v.string(),
      amount: v.number(),
      helloasso_status: v.string(),
      synced_at: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const reg of args.registrants) {
      const existing = await ctx.db
        .query("registrants")
        .withIndex("by_helloasso_payment_id", (q) => q.eq("helloasso_payment_id", reg.helloasso_payment_id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, reg);
      } else {
        await ctx.db.insert("registrants", reg);
      }
      count++;
    }
    return count;
  },
});

// --- ACTION POUR SYNCHRONISER ---
export const syncHelloAsso = authenticatedAction({
  args: {},
  handler: async (ctx) => {
    const clientId = process.env.HELLOASSO_CLIENT_ID;
    const clientSecret = process.env.HELLOASSO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { synced_count: 0, errors: ['HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET manquants'] };
    }

    // On utilise la mutation interne pour récupérer les liens via une query
    // Wait, actions can only call queries or mutations. Let's create an internal query to get links.
    const links = await ctx.runQuery(internal.helloasso.getLinksInternal, {});
    
    if (!links || links.length === 0) {
      return { synced_count: 0, errors: ['Aucun lien HelloAsso configuré'] };
    }

    let helloassoToken: string;
    try {
      helloassoToken = await getAccessToken(clientId, clientSecret);
    } catch (e: any) {
      return { synced_count: 0, errors: [`Erreur d'authentification HelloAsso: ${e.message}`] };
    }

    const now = new Date().toISOString();
    const errors: string[] = [];
    const registrantsToUpsert: any[] = [];

    for (const link of links) {
      const parsed = parseHaUrl(link.url);
      if (!parsed) {
        errors.push(`URL non parsable [${link.label}]: ${link.url}`);
        continue;
      }
      try {
        const payments = await fetchAllPayments(helloassoToken, parsed.orgSlug, parsed.formType, parsed.formSlug);
        
        for (const p of payments) {
          const payer = p.payer ?? p.order?.payer ?? {};
          const firstItem = p.items?.[0];
          const user = firstItem?.user ?? {};

          registrantsToUpsert.push({
            helloasso_payment_id: String(p.id),
            helloasso_link_id: link._id,
            first_name: user.firstName || payer.firstName || '',
            last_name: user.lastName || payer.lastName || '',
            email: user.email || '',
            phone: extractPhone(p.items) || undefined,
            payer_first_name: payer.firstName || '',
            payer_last_name: payer.lastName || '',
            payer_email: payer.email || '',
            payment_date: p.date,
            amount: p.amount / 100, // en euros
            helloasso_status: p.state,
            synced_at: now,
          });

          // Remboursements
          if (p.refundOperations && p.refundOperations.length > 0) {
            for (const refund of p.refundOperations) {
              registrantsToUpsert.push({
                helloasso_payment_id: `refund-${refund.id}`,
                helloasso_link_id: link._id,
                first_name: user.firstName || payer.firstName || '',
                last_name: user.lastName || payer.lastName || '',
                email: user.email || '',
                phone: extractPhone(p.items) || undefined,
                payer_first_name: payer.firstName || '',
                payer_last_name: payer.lastName || '',
                payer_email: payer.email || '',
                payment_date: refund.meta?.createdAt || p.date,
                amount: -(refund.amount / 100),
                helloasso_status: 'Refunded',
                synced_at: now,
              });
            }
          }
        }
      } catch (err: any) {
        errors.push(`[${link.label}] ${err.message}`);
      }
    }

    // Upsert via internal mutation
    let synced_count = 0;
    if (registrantsToUpsert.length > 0) {
      // Chunk par 100 pour éviter les payload trop larges
      const chunkSize = 100;
      for (let i = 0; i < registrantsToUpsert.length; i += chunkSize) {
        const chunk = registrantsToUpsert.slice(i, i + chunkSize);
        const count = await ctx.runMutation(internal.helloasso.upsertRegistrants, { registrants: chunk });
        synced_count += count;
      }
    }

    return { synced_count, errors };
  }
});

import { internalQuery } from "./_generated/server";

export const getLinksInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("helloasso_links").collect();
  }
});
