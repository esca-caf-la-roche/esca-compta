import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { authenticatedQuery, authenticatedMutation } from "./customFunctions";
import { getUserSettings, requireAdmin, TILES } from "./access";
import { champsModifies } from "./dbUtils";

const dashboardTileValidator = v.union(
  v.literal("compta"),
  v.literal("paiements"),
  v.literal("budget"),
  v.literal("abonnements"),
  v.literal("licences_cours"),
  v.literal("contacts_cours"),
  v.literal("remboursements_eleves"),
);

const dashboardColorValidator = v.union(
  v.literal("bg-info"),
  v.literal("bg-success"),
  v.literal("bg-warning"),
  v.literal("bg-primary"),
  v.literal("bg-danger"),
);

function hasEachTileExactlyOnce(tileIds: readonly string[]): boolean {
  return (
    tileIds.length === TILES.length &&
    new Set(tileIds).size === TILES.length &&
    TILES.every((tile) => tileIds.includes(tile))
  );
}

function dashboardTilesAreEqual(
  saved: readonly { id: string; color: string }[],
  submitted: readonly { id: string; color: string }[],
): boolean {
  return (
    saved.length === submitted.length &&
    saved.every(
      (tile, index) =>
        tile.id === submitted[index]?.id && tile.color === submitted[index]?.color,
    )
  );
}

// PUBLIC: renvoie uniquement l'utilisateur connecté (null sinon) — sans risque.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

// PUBLIC: appelé AVANT connexion par le provider google-otp pour gater l'envoi
// de l'OTP aux emails pré-enregistrés. Ne renvoie qu'un booléen.
export const checkEmailExists = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    return user !== null;
  },
});

export const listUsers = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    // Expose tous les emails/accès : réservé à la page Configurations (admin).
    await requireAdmin(ctx, ctx.userId);

    const users = await ctx.db.query("users").collect();
    const userSettings = await ctx.db.query("userSettings").collect();
    
    return users.map(user => {
      const settings = userSettings.find(s => s.userId === user._id) || { allowedTiles: [] as string[], role: "user" };
      return {
        ...user,
        settings
      };
    });
  },
});

export const getCurrentUserSettings = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
    return settings || { allowedTiles: [] as string[], role: "user" };
  },
});

export const addUser = authenticatedMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    const name = args.name.trim();
    if (!name) {
      throw new Error("Le nom est obligatoire.");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      throw new Error("Un utilisateur avec cet email existe déjà.");
    }

    const newUserId = await ctx.db.insert("users", {
      email: args.email,
      name
    });
    
    await ctx.db.insert("userSettings", {
      userId: newUserId,
      allowedTiles: ["compta", "paiements", "budget"],
      role: "user"
    });
    
    return newUserId;
  },
});

export const removeUser = authenticatedMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
      
    if (settings) {
      await ctx.db.delete(settings._id);
    }
    
    await ctx.db.delete(args.userId);
  },
});

// La lecture est ouverte à tout le staff authentifié : la configuration pilote
// l'affichage de leur tableau de bord. Les modifications restent réservées aux
// administrateurs ci-dessous.
export const getDashboardConfiguration = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await getUserSettings(ctx, ctx.userId))) {
      throw new ConvexError("Accès refusé : compte staff requis.");
    }

    return await ctx.db
      .query("dashboardConfiguration")
      .withIndex("by_cle", (q) => q.eq("cle", "global"))
      .unique();
  },
});

export const updateDashboardConfiguration = authenticatedMutation({
  args: {
    tiles: v.array(
      v.object({
        id: dashboardTileValidator,
        color: dashboardColorValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    if (!hasEachTileExactlyOnce(args.tiles.map((tile) => tile.id))) {
      throw new ConvexError(
        "La configuration doit contenir chaque tuile exactement une fois.",
      );
    }

    const existing = await ctx.db
      .query("dashboardConfiguration")
      .withIndex("by_cle", (q) => q.eq("cle", "global"))
      .unique();
    const configuration = {
      cle: "global" as const,
      tiles: args.tiles,
    };

    if (!existing) {
      return await ctx.db.insert("dashboardConfiguration", configuration);
    }

    if (
      champsModifies(existing, { cle: configuration.cle }) ||
      !dashboardTilesAreEqual(existing.tiles, configuration.tiles)
    ) {
      await ctx.db.patch(existing._id, configuration);
    }

    return existing._id;
  },
});

export const updateUserSettings = authenticatedMutation({
  args: {
    userId: v.id("users"),
    allowedTiles: v.array(v.string()),
    role: v.string(),
    name: v.string()
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    const name = args.name.trim();
    if (!name) {
      throw new Error("Le nom est obligatoire.");
    }

    await ctx.db.patch(args.userId, { name });

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
      
    if (settings) {
      await ctx.db.patch(settings._id, {
        allowedTiles: args.allowedTiles,
        role: args.role
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId: args.userId,
        allowedTiles: args.allowedTiles,
        role: args.role
      });
    }
  },
});
