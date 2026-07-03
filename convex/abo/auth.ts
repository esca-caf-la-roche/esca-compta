// Identité & autorisation du module Abonnements (équivalent Convex de la RLS +
// is_admin() de abo-esca-new). Deux populations partagent la table `users` :
//   - staff compta  : ont un `userSettings` ; admin abo UNIQUEMENT si la tuile
//                      "abonnements" est cochée (allowedTiles). Le rôle "admin"
//                      ne donne aucun passe-droit sur les tuiles.
//   - abonnés publics: ont un `abo_profiles` (role "utilisateur"), pas de
//                      `userSettings` → aucun accès compta.
// Toute la sécurité des endpoints abo passe par ces helpers.

import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type AboRole = "utilisateur" | "admin";

export interface AboIdentity {
  userId: Id<"users">;
  aboRole: AboRole;
  email: string;
  nom?: string;
  prenom?: string;
}

// Identité de l'appelant (ou null s'il n'est pas connecté). aboRole="admin"
// pour le staff possédant la tuile "abonnements" cochée, sinon "utilisateur".
export async function getAboIdentity(
  ctx: QueryCtx | MutationCtx,
): Promise<AboIdentity | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  // Seule la case "abonnements" cochée dans Configurations > Utilisateurs
  // donne la gestion des abonnements — le rôle admin ne bypass pas les tuiles.
  const isStaffAdmin = (settings?.allowedTiles ?? []).includes("abonnements");

  const profile = await ctx.db
    .query("abo_profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  return {
    userId,
    aboRole: isStaffAdmin ? "admin" : "utilisateur",
    email: (user.email as string | undefined) ?? profile?.email ?? "",
    nom: profile?.nom ?? undefined,
    prenom: profile?.prenom ?? undefined,
  };
}

// Variante qui lève si non connecté.
export async function requireAboIdentity(
  ctx: QueryCtx | MutationCtx,
): Promise<AboIdentity> {
  const id = await getAboIdentity(ctx);
  if (!id) {
    throw new Error("Non autorisé : vous devez être connecté.");
  }
  return id;
}

// Lève si l'appelant n'est pas admin abo.
export async function requireAboAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<AboIdentity> {
  const id = await requireAboIdentity(ctx);
  if (id.aboRole !== "admin") {
    throw new Error("Réservé aux administrateurs.");
  }
  return id;
}

// Charge un dossier en vérifiant qu'il appartient à l'appelant (ou admin).
// Lève si absent ou non autorisé.
export async function requireOwnedDossier(
  ctx: QueryCtx | MutationCtx,
  dossierId: Id<"abo_dossiers">,
) {
  const id = await requireAboIdentity(ctx);
  const dossier = await ctx.db.get(dossierId);
  if (!dossier) throw new Error("Dossier introuvable.");
  if (id.aboRole !== "admin" && dossier.owner_id !== id.userId) {
    throw new Error("Accès refusé à ce dossier.");
  }
  return { identity: id, dossier };
}
