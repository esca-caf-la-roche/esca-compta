import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function ValidationPaiements() {
  const registrants = useQuery(api.paiements.getRegistrants);
  const statuses = useQuery(api.paiements.getPaymentsStatus);
  const links = useQuery(api.paiements.getLinks);
  const setPaymentStatus = useMutation(api.paiements.setPaymentStatus);
  const deletePaymentStatus = useMutation(api.paiements.deletePaymentStatus);
  const syncHelloAsso = useAction(api.helloasso.syncHelloAsso);

  const [syncing, setSyncing] = useState(false);
  const [filterStatus, setFilterStatus] = useState("À traiter");

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncHelloAsso();
      if (result.errors && result.errors.length > 0) {
        alert("Erreurs pendant la sync:\n" + result.errors.join("\n"));
      } else {
        alert(`Synchronisation terminée : ${result.synced_count} dossiers mis à jour.`);
      }
    } catch (e: any) {
      alert("Erreur de synchronisation : " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const dossiers = useMemo(() => {
    if (!registrants || !statuses || !links) return [];
    
    const groupsMap = new Map();
    
    // Grouper les paiements
    registrants.forEach((reg: any) => {
      const link = links.find((l: any) => l._id === reg.helloasso_link_id);
      let dossier_key = reg.helloasso_payment_id;
      if (link?.is_installment && link.parent_link_id) {
        dossier_key = `${reg.payer_email.toLowerCase()}::${link.parent_link_id}`;
      }
      
      if (!groupsMap.has(dossier_key)) {
        groupsMap.set(dossier_key, {
          dossier_key,
          registrants: [],
          link,
          total_amount: 0,
        });
      }
      
      const group = groupsMap.get(dossier_key);
      group.registrants.push(reg);
    });

    return Array.from(groupsMap.values()).map((group: any) => {
      // Trier par date
      group.registrants.sort((a: any, b: any) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
      
      const ref = group.registrants[0];
      const statusObj = statuses.find((s: any) => s.helloasso_payment_id === ref.helloasso_payment_id);
      
      // Montant total = somme si 1x, ou somme des 3x si c'est un installment (ici on simule avec amount * 3 ou somme)
      const totalAmount = group.link?.is_installment ? ref.amount * 3 : ref.amount;

      return {
        ...ref,
        dossier_key: group.dossier_key,
        local_status: statusObj?.status || "À traiter",
        comment: statusObj?.comment,
        total_amount: totalAmount,
        transactions: group.registrants,
        link: group.link,
      };
    });
  }, [registrants, statuses, links]);

  const filteredDossiers = useMemo(() => {
    return dossiers.filter(d => d.local_status === filterStatus);
  }, [dossiers, filterStatus]);

  if (registrants === undefined || statuses === undefined || links === undefined) {
    return <div className="p-8">Chargement des données...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Validation des Paiements</h1>
          <p className="text-gray-600">Gérez le statut des inscriptions HelloAsso.</p>
        </div>
        <button 
          onClick={handleSync} 
          disabled={syncing}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
        >
          {syncing ? "Synchronisation en cours..." : "⟳ Synchroniser HelloAsso"}
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <select 
          value={filterStatus} 
          onChange={e => setFilterStatus(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="À traiter">À traiter ({dossiers.filter(d => d.local_status === "À traiter").length})</option>
          <option value="En attente">En attente ({dossiers.filter(d => d.local_status === "En attente").length})</option>
          <option value="Traité">Traité ({dossiers.filter(d => d.local_status === "Traité").length})</option>
          <option value="Remboursé">Remboursé ({dossiers.filter(d => d.local_status === "Remboursé").length})</option>
          <option value="Problème">Problème ({dossiers.filter(d => d.local_status === "Problème").length})</option>
        </select>
      </div>

      <div className="grid gap-4">
        {filteredDossiers.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded border text-gray-500">
            Aucun dossier ne correspond à ce statut.
          </div>
        ) : (
          filteredDossiers.map(dossier => (
            <div key={dossier.dossier_key} className="p-4 bg-white rounded shadow border-l-4" style={{
              borderLeftColor: 
                dossier.local_status === 'Traité' ? '#22c55e' : 
                dossier.local_status === 'En attente' ? '#eab308' : 
                dossier.local_status === 'Remboursé' ? '#94a3b8' :
                dossier.local_status === 'Problème' ? '#ef4444' : '#3b82f6'
            }}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{dossier.first_name} {dossier.last_name}</h3>
                  <p className="text-sm text-gray-600">Payeur: {dossier.payer_first_name} {dossier.payer_last_name} ({dossier.payer_email})</p>
                  <p className="text-sm text-gray-600">Montant total: {dossier.total_amount} € {dossier.link?.is_installment ? "(3x)" : "(1x)"}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400">Dernier statut HelloAsso: {dossier.helloasso_status}</span>
                </div>
              </div>
              
              <div className="mt-4 flex gap-2">
                {dossier.local_status !== 'À traiter' && (
                  <button onClick={() => deletePaymentStatus({ helloasso_payment_id: dossier.helloasso_payment_id })} className="text-xs border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">
                    ↺ Remettre "À traiter"
                  </button>
                )}
                {dossier.local_status !== 'Traité' && (
                  <button onClick={() => setPaymentStatus({ helloasso_payment_id: dossier.helloasso_payment_id, dossier_key: dossier.dossier_key, status: "Traité" })} className="text-xs border px-3 py-1 rounded bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                    ✓ Traité
                  </button>
                )}
                {dossier.local_status !== 'En attente' && (
                  <button onClick={() => setPaymentStatus({ helloasso_payment_id: dossier.helloasso_payment_id, dossier_key: dossier.dossier_key, status: "En attente", comment: prompt("Commentaire (optionnel):") || undefined })} className="text-xs border px-3 py-1 rounded bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100">
                    ⏸ En attente
                  </button>
                )}
                {dossier.local_status !== 'Problème' && (
                  <button onClick={() => setPaymentStatus({ helloasso_payment_id: dossier.helloasso_payment_id, dossier_key: dossier.dossier_key, status: "Problème", comment: prompt("Raison du problème:") || undefined })} className="text-xs border px-3 py-1 rounded bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
                    ⚠ Problème
                  </button>
                )}
                {dossier.local_status !== 'Remboursé' && (
                  <button onClick={() => setPaymentStatus({ helloasso_payment_id: dossier.helloasso_payment_id, dossier_key: dossier.dossier_key, status: "Remboursé" })} className="text-xs border px-3 py-1 rounded bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100">
                    ↩ Remboursé
                  </button>
                )}
              </div>
              {dossier.comment && (
                <p className="mt-2 text-sm italic text-gray-500 bg-gray-50 p-2 rounded">Note: {dossier.comment}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
