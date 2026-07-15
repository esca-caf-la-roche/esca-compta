// Vérification des licences FFCAM des élèves EN COURS (portail staff, tuile
// "licences_cours" — distinct du portail Abonnements qui gère les demandes).
//
// Règle de validité (saison sportive démarrant début septembre) :
//   - horaire === "Liste d'attente" → élève pas en cours, hors périmètre.
//   - licence renseignée → toujours valide.
//   - licence vide → valide UNIQUEMENT en septembre ET si saison_precedente
//     est renseignée (élève déjà en cours l'an dernier, tolérance d'un mois
//     pour re-fournir son numéro). Sinon → non valide.
// Lecture seule : abo_eleves_en_cours est régénérée à chaque scrape du site
// club, ce n'est pas la table d'identité canonique — aucune résolution n'y
// est persistée ici (à la différence de abo/licences.ts sur abo_personnes).

import { authenticatedQuery } from "../customFunctions";
import { requireTile } from "../access";
import { normaliserNomPrenom, similarite, estSeptembreParis } from "./lib";

const SEUIL_TRGM = 0.3;
const MAX_CANDIDATS = 5;

type Raison = "licence_absente_hors_fenetre" | "nouvel_eleve_sans_licence";

function licenceValide(
  eleve: { licence?: string; saison_precedente?: string },
  nowMs: number,
): boolean {
  if ((eleve.licence ?? "").trim() !== "") return true;
  const saisonPrecedente = (eleve.saison_precedente ?? "").trim();
  return estSeptembreParis(nowMs) && saisonPrecedente !== "";
}

export const getElevesLicenceInvalide = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    await requireTile(ctx, ctx.userId, "licences_cours");

    const tous = await ctx.db.query("abo_eleves_en_cours").collect();
    const enCours = tous.filter((e) => e.horaire !== "Liste d'attente");

    const now = Date.now();
    const invalides = enCours.filter((e) => !licenceValide(e, now));
    if (invalides.length === 0) return { total: 0, eleves: [] };

    const annuaire = await ctx.db.query("abo_licences").collect();

    const eleves = invalides.map((e) => {
      const raison: Raison =
        estSeptembreParis(now) && (e.saison_precedente ?? "").trim() === ""
          ? "nouvel_eleve_sans_licence"
          : "licence_absente_hors_fenetre";

      let candidats: Array<{
        licence: string;
        nom: string | null;
        prenom: string | null;
        score: number;
      }> = [];

      if ((e.licence ?? "").trim() === "") {
        const inverse = normaliserNomPrenom(e.prenom, e.nom);
        candidats = annuaire
          .map((l) => ({
            l,
            score: Math.max(
              similarite(e.nom_prenom_normalise, l.nom_prenom_normalise),
              similarite(inverse, l.nom_prenom_normalise),
            ),
          }))
          .filter((x) => x.score >= SEUIL_TRGM)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_CANDIDATS)
          .map((x) => ({
            licence: x.l.licence,
            nom: x.l.nom ?? null,
            prenom: x.l.prenom ?? null,
            score: x.score,
          }));
      }

      return {
        eleve_id: e._id,
        nom: e.nom ?? null,
        prenom: e.prenom ?? null,
        cours: e.cours ?? null,
        horaire: e.horaire ?? null,
        licence: e.licence ?? null,
        saison_precedente: e.saison_precedente ?? null,
        raison,
        candidats,
      };
    });

    eleves.sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr"),
    );

    return { total: eleves.length, eleves };
  },
});
