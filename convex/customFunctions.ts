import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { query, mutation, action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Non autorisé : Vous devez être connecté pour effectuer cette action.");
    }
    return { ctx: { userId }, args: {} };
  },
});

export const authenticatedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Non autorisé : Vous devez être connecté pour effectuer cette action.");
    }
    return { ctx: { userId }, args: {} };
  },
});

export const authenticatedAction = customAction(action, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Non autorisé : Vous devez être connecté pour effectuer cette action.");
    }
    return { ctx: { userId }, args: {} };
  },
});
