// Helpers d'autorisation du portail staff (compta).
//
// RÈGLE DE BASE (source de vérité : page Configurations > Utilisateurs) :
//   - L'accès à un MODULE (tuile) est donné UNIQUEMENT par userSettings.allowedTiles.
//     Le rôle "admin" ne donne AUCUN passe-droit sur les tuiles.
//   - Le rôle "admin" sert uniquement à administrer l'application :
//     gestion des utilisateurs/accès et des saisons (page Configurations).
//   - Les abonnés publics (provider abo-otp) n'ont pas de userSettings :
//     ils ne passent jamais ces gardes.

import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";

// Identifiants des tuiles/modules. Doit rester aligné avec TILE_OPTIONS
// (src/pages/Configurations.tsx) et les tuiles du Dashboard.
export const TILES = [
  "compta",
  "paiements",
  "budget",
  "abonnements",
  "licences_cours",
  "contacts_cours",
  "remboursements_eleves",
] as const;
export type Tile = (typeof TILES)[number];

export async function getUserSettings(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userSettings"> | null> {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

// Garde "module" : l'appelant doit avoir la tuile cochée. Pas de bypass admin.
export async function requireTile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  tile: Tile,
): Promise<Doc<"userSettings">> {
  const settings = await getUserSettings(ctx, userId);
  if (!settings || !settings.allowedTiles.includes(tile)) {
    throw new ConvexError("Accès refusé : ce module ne vous est pas attribué.");
  }
  return settings;
}

// Garde "administration" : réservé au rôle admin (Configurations uniquement).
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userSettings">> {
  const settings = await getUserSettings(ctx, userId);
  if (settings?.role !== "admin") {
    throw new ConvexError("Réservé aux administrateurs.");
  }
  return settings;
}
