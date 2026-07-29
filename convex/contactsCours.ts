// Contacts des élèves inscrits aux cours, issus du snapshot externe courant.
// SAISON-EXEMPT: cette tuile reflète l'état courant du site club, sans navigation
// ni historique par saison.

import { v, ConvexError } from "convex/values";
import { authenticatedQuery } from "./customFunctions";
import { internalQuery } from "./_generated/server";
import { requireTile } from "./access";

const MAX_CONTACTS = 1_000;

function estListeAttente(horaire: string | undefined): boolean {
  return (horaire ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr") === "liste d'attente";
}

export const listContacts = authenticatedQuery({
  args: {},
  returns: v.object({
    contacts: v.array(
      v.object({
        eleve_id: v.id("abo_eleves_en_cours"),
        nom: v.union(v.string(), v.null()),
        prenom: v.union(v.string(), v.null()),
        cours: v.union(v.string(), v.null()),
        horaire: v.union(v.string(), v.null()),
        encadrants: v.union(v.string(), v.null()),
        email: v.union(v.string(), v.null()),
        emailSource: v.union(v.literal("eleve"), v.literal("gestion"), v.null()),
        telephone: v.union(v.string(), v.null()),
        telephoneSource: v.union(v.literal("eleve"), v.literal("gestion"), v.null()),
      }),
    ),
    lastSyncAt: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "contacts_cours");

    const eleves = await ctx.db
      .query("abo_eleves_en_cours")
      .take(MAX_CONTACTS + 1);
    if (eleves.length > MAX_CONTACTS) {
      throw new ConvexError({
        code: "54000",
        message: `Le nombre de contacts dépasse la limite de ${MAX_CONTACTS}.`,
      });
    }

    const marqueur = await ctx.db
      .query("abo_app_config")
      .withIndex("by_cle", (q) => q.eq("cle", "last_sync_eleves"))
      .first();

    const coordonneeEffective = (
      eleve: string | undefined,
      gestion: string | undefined,
    ): { valeur: string | null; source: "eleve" | "gestion" | null } => {
      const valeurEleve = (eleve ?? "").trim();
      if (valeurEleve) return { valeur: valeurEleve, source: "eleve" };
      const valeurGestion = (gestion ?? "").trim();
      if (valeurGestion) return { valeur: valeurGestion, source: "gestion" };
      return { valeur: null, source: null };
    };

    const contacts = eleves
      .filter((eleve) => !estListeAttente(eleve.horaire))
      .map((eleve) => {
        const email = coordonneeEffective(eleve.email_eleve, eleve.email_gestion);
        const telephone = coordonneeEffective(
          eleve.telephone_eleve,
          eleve.telephone_gestion,
        );
        return {
          eleve_id: eleve._id,
          nom: eleve.nom ?? null,
          prenom: eleve.prenom ?? null,
          cours: eleve.cours ?? null,
          horaire: eleve.horaire ?? null,
          encadrants: eleve.encadrants ?? null,
          email: email.valeur,
          emailSource: email.source,
          telephone: telephone.valeur,
          telephoneSource: telephone.source,
        };
      });

    contacts.sort((a, b) =>
      `${a.nom ?? ""} ${a.prenom ?? ""} ${a.cours ?? ""} ${a.horaire ?? ""}`.localeCompare(
        `${b.nom ?? ""} ${b.prenom ?? ""} ${b.cours ?? ""} ${b.horaire ?? ""}`,
        "fr",
      ),
    );

    return {
      contacts,
      lastSyncAt: marqueur?.valeur ?? null,
    };
  },
});

// Garde interne appelée depuis une action : l'identité est dérivée par le
// wrapper authenticatedAction puis transmise uniquement à cette fonction privée.
export const requireContactsCoursAccess = internalQuery({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTile(ctx, args.userId, "contacts_cours");
    return null;
  },
});
