import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { X, Save } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { useSeason } from "../contexts/SeasonContext";

type Transaction = {
  _id: Id<"transactions">;
  nom: string;
  date: string;
  realise: number;
  typeDocument: string;
  commentaires?: string;
  tiersId: Id<"tiers">;
  analytiqueId: Id<"analytiques">;
  tiersNom?: string;
  analytiqueNom?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  transactionToEdit: Transaction | null;
};

export default function TransactionFormModal({ isOpen, onClose, transactionToEdit }: Props) {
  const { season } = useSeason();
  const tiersList = useQuery(api.references.getTiers);
  const analytiquesList = useQuery(api.references.getAnalytiques);
  
  const createTransaction = useMutation(api.transactions.create);
  const updateTransaction = useMutation(api.transactions.update);
  const createTiers = useMutation(api.tiers.create);


  const [date, setDate] = useState("");
  const [montant, setMontant] = useState("");
  const [typeTransaction, setTypeTransaction] = useState<"recette" | "depense">("depense");
  const [typeDocument, setTypeDocument] = useState("Facture");
  const [tiersInput, setTiersInput] = useState("");
  const [analytiqueInput, setAnalytiqueInput] = useState("");
  const [commentaires, setCommentaires] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pré-remplir le formulaire si on édite
  useEffect(() => {
    if (transactionToEdit) {

      setDate(transactionToEdit.date);
      setMontant(Math.abs(transactionToEdit.realise).toString());
      setTypeTransaction(transactionToEdit.realise >= 0 ? "recette" : "depense");
      setTypeDocument(transactionToEdit.typeDocument);
      setCommentaires(transactionToEdit.commentaires || "");
      
      // Essayer de récupérer le nom depuis l'objet étendu, sinon on cherche dans la liste
      const tName = transactionToEdit.tiersNom || tiersList?.find(t => t._id === transactionToEdit.tiersId)?.nom || "";
      const aName = transactionToEdit.analytiqueNom || analytiquesList?.find(a => a._id === transactionToEdit.analytiqueId)?.nom || "";
      
      setTiersInput(tName);
      setAnalytiqueInput(aName);
    } else {
      // Valeurs par défaut pour une création

      setDate(new Date().toISOString().split("T")[0]); // Date du jour
      setMontant("");
      setTypeTransaction("depense");
      setTypeDocument("Facture");
      setTiersInput("");
      setAnalytiqueInput("");
      setCommentaires("");
    }
  }, [transactionToEdit, isOpen, tiersList, analytiquesList]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const anaName = analytiqueInput.trim();
    const tName = tiersInput.trim();
    
    if (!anaName || !tName) {
      alert("Veuillez renseigner le Tiers et l'Analytique.");
      return;
    }

    // Vérification de l'analytique : il DOIT exister
    const foundAna = analytiquesList?.find(a => a.nom.toLowerCase() === anaName.toLowerCase());
    if (!foundAna) {
      alert("Catégorie Analytique inconnue. Veuillez sélectionner une catégorie existante dans la liste.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Vérification du Tiers : s'il n'existe pas, on le crée
      let finalTiersId: Id<"tiers">;
      const foundTiers = tiersList?.find(t => t.nom.toLowerCase() === tName.toLowerCase());
      
      if (foundTiers) {
        finalTiersId = foundTiers._id;
      } else {
        // Création du nouveau tiers
        finalTiersId = await createTiers({ nom: tName });
      }

      const realMontant = parseFloat(montant);
      const realise = typeTransaction === "depense" ? -Math.abs(realMontant) : Math.abs(realMontant);

      // Génération automatique du nom
      const dateObj = new Date(date);
      const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().slice(2, 10) : date;
      const anaNamePart = anaName.substring(0, 5);
      const typePart = typeDocument.replaceAll(" ", "_");
      const tiersPart = tName.replaceAll(" ", "_");
      const comPart = commentaires.trim().replaceAll(" ", "_");
      const generatedNom = `${anaNamePart}_${dateStr}_${typePart}_${tiersPart}_${comPart}`;

      const payload = {
        nom: generatedNom,
        date,
        realise,
        typeDocument,
        tiersId: finalTiersId,
        analytiqueId: foundAna._id,
        saison: season,
        commentaires: commentaires.trim() !== "" ? commentaires : undefined,
      };

      if (transactionToEdit) {
        await updateTransaction({ id: transactionToEdit._id, ...payload });
      } else {
        await createTransaction(payload);
      }
      onClose();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
      alert("Une erreur est survenue lors de la sauvegarde.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {transactionToEdit ? "Modifier la Transaction" : "Nouvelle Transaction"}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="date">Date</label>
              <input 
                className="input-field" 
                id="date" 
                type="date" 
                required 
                value={date} 
                onChange={e => setDate(e.target.value)} 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="typeTransaction">Nature</label>
              <select 
                className="input-field" 
                id="typeTransaction" 
                value={typeTransaction} 
                onChange={e => setTypeTransaction(e.target.value as "recette" | "depense")}
                style={{ backgroundColor: typeTransaction === "recette" ? "var(--success)" : "var(--primary)", color: "white" }}
              >
                <option value="depense">Dépense (-)</option>
                <option value="recette">Recette (+)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="montant">Montant (€)</label>
              <input 
                className="input-field" 
                id="montant" 
                type="number" 
                step="0.01" 
                min="0"
                required 
                value={montant} 
                onChange={e => setMontant(e.target.value)} 
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="typeDocument">Type de document</label>
              <select 
                className="input-field" 
                id="typeDocument" 
                value={typeDocument} 
                onChange={e => setTypeDocument(e.target.value)}
              >
                <option value="Facture">Facture</option>
                <option value="Note de Frais">Note de Frais</option>
                <option value="Virement SEPA">Virement SEPA</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="tiersInput">Tiers (Fournisseur/Client)</label>
            <input 
              className="input-field" 
              id="tiersInput" 
              type="text"
              list="tiers-list"
              required
              value={tiersInput} 
              onChange={e => setTiersInput(e.target.value)}
              placeholder="Sélectionner ou taper pour créer"
              autoComplete="off"
            />
            <datalist id="tiers-list">
              {tiersList?.map(t => (
                <option key={t._id} value={t.nom} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="analytiqueInput">Analytique (Catégorie)</label>
            <input 
              className="input-field" 
              id="analytiqueInput" 
              type="text"
              list="analytique-list"
              required
              value={analytiqueInput} 
              onChange={e => setAnalytiqueInput(e.target.value)}
              placeholder="Sélectionner une catégorie existante"
              autoComplete="off"
            />
            <datalist id="analytique-list">
              {analytiquesList?.map(a => (
                <option key={a._id} value={a.nom} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="commentaires">Commentaire (optionnel)</label>
            <textarea 
              className="input-field form-textarea" 
              id="commentaires" 
              value={commentaires} 
              onChange={e => setCommentaires(e.target.value)} 
              placeholder="Détails supplémentaires..."
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ width: "auto" }}>
              <Save size={18} style={{ display: "inline-block", marginRight: "0.5rem", verticalAlign: "middle" }} />
              {isSubmitting ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
