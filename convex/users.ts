import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { authenticatedQuery, authenticatedMutation } from "./customFunctions";

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
    const callerSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (callerSettings?.role !== "admin") {
      throw new Error("Seul un administrateur peut ajouter un utilisateur.");
    }

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
      allowedTiles: ["compta"],
      role: "user"
    });
    
    return newUserId;
  },
});

export const removeUser = authenticatedMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const callerSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
      
    if (callerSettings?.role !== "admin") {
      throw new Error("Seul un administrateur peut supprimer un utilisateur.");
    }
    
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

export const updateUserSettings = authenticatedMutation({
  args: {
    userId: v.id("users"),
    allowedTiles: v.array(v.string()),
    role: v.string(),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const callerSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (callerSettings?.role !== "admin") {
      throw new Error("Seul un administrateur peut modifier les accès.");
    }

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
