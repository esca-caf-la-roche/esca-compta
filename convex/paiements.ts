import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./customFunctions";

// --- HELLOASSO LINKS ---

export const getLinks = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("helloasso_links").collect();
  },
});

export const addLink = authenticatedMutation({
  args: {
    url: v.string(),
    label: v.string(),
    parent_link_id: v.optional(v.id("helloasso_links")),
    is_installment: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("helloasso_links", {
      url: args.url,
      label: args.label,
      responsible_id: ctx.userId,
      parent_link_id: args.parent_link_id,
      is_installment: args.is_installment,
    });
  },
});

export const updateLink = authenticatedMutation({
  args: {
    id: v.id("helloasso_links"),
    url: v.string(),
    label: v.string(),
    parent_link_id: v.optional(v.id("helloasso_links")),
    is_installment: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch(id, data);
  },
});

export const deleteLink = authenticatedMutation({
  args: { id: v.id("helloasso_links") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// --- GROUPS ---

export const getGroups = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("groups").collect();
  },
});

export const addGroup = authenticatedMutation({
  args: {
    name: v.string(),
    link_id: v.id("helloasso_links"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("groups", {
      name: args.name,
      link_id: args.link_id,
    });
  },
});

export const updateGroup = authenticatedMutation({
  args: {
    id: v.id("groups"),
    name: v.string(),
    link_id: v.id("helloasso_links"),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch(id, data);
  },
});

export const deleteGroup = authenticatedMutation({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// --- REGISTRANTS & STATUS ---

export const getRegistrants = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("registrants").collect();
  },
});

export const getPaymentsStatus = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("payments_status").collect();
  },
});

export const setPaymentStatus = authenticatedMutation({
  args: {
    helloasso_payment_id: v.string(),
    dossier_key: v.string(),
    status: v.string(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payments_status")
      .withIndex("by_helloasso_payment_id", (q) => q.eq("helloasso_payment_id", args.helloasso_payment_id))
      .first();

    const now = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        comment: args.comment,
        updated_by: ctx.userId,
        updated_at: now,
      });

      await ctx.db.insert("payments_status_history", {
        helloasso_payment_id: args.helloasso_payment_id,
        old_status: existing.status,
        new_status: args.status,
        comment: args.comment,
        updated_by: ctx.userId,
        updated_at: now,
      });
    } else {
      await ctx.db.insert("payments_status", {
        helloasso_payment_id: args.helloasso_payment_id,
        dossier_key: args.dossier_key,
        status: args.status,
        comment: args.comment,
        updated_by: ctx.userId,
        updated_at: now,
      });

      await ctx.db.insert("payments_status_history", {
        helloasso_payment_id: args.helloasso_payment_id,
        old_status: undefined,
        new_status: args.status,
        comment: args.comment,
        updated_by: ctx.userId,
        updated_at: now,
      });
    }
  },
});

export const deletePaymentStatus = authenticatedMutation({
  args: {
    helloasso_payment_id: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payments_status")
      .withIndex("by_helloasso_payment_id", (q) => q.eq("helloasso_payment_id", args.helloasso_payment_id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      
      await ctx.db.insert("payments_status_history", {
        helloasso_payment_id: args.helloasso_payment_id,
        old_status: existing.status,
        new_status: "REOUVERT",
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      });
    }
  },
});

export const resetSeason = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    const callerSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
      
    if (callerSettings?.role !== "admin") {
      throw new Error("Seul un administrateur peut réinitialiser la saison.");
    }

    const registrants = await ctx.db.query("registrants").collect();
    for (const reg of registrants) {
      await ctx.db.delete(reg._id);
    }

    const statuses = await ctx.db.query("payments_status").collect();
    for (const status of statuses) {
      await ctx.db.delete(status._id);
    }

    const history = await ctx.db.query("payments_status_history").collect();
    for (const h of history) {
      await ctx.db.delete(h._id);
    }

    await ctx.db.insert("season_resets", {
      reset_at: new Date().toISOString(),
      reset_by: ctx.userId,
    });
  },
});
