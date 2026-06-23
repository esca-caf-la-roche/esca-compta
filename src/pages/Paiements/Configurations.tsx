import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function Configurations() {
  const links = useQuery(api.paiements.getLinks);
  const groups = useQuery(api.paiements.getGroups);
  const addLink = useMutation(api.paiements.addLink);
  const deleteLink = useMutation(api.paiements.deleteLink);
  const addGroup = useMutation(api.paiements.addGroup);
  const deleteGroup = useMutation(api.paiements.deleteGroup);
  const resetSeason = useMutation(api.paiements.resetSeason);

  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkIsInstallment, setNewLinkIsInstallment] = useState(false);
  const [newLinkParentId, setNewLinkParentId] = useState<string | undefined>("");

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLinkId, setNewGroupLinkId] = useState("");

  const handleAddLink = async () => {
    if (!newLinkUrl || !newLinkLabel) return;
    await addLink({
      url: newLinkUrl,
      label: newLinkLabel,
      is_installment: newLinkIsInstallment,
      parent_link_id: newLinkParentId ? (newLinkParentId as any) : undefined,
    });
    setNewLinkUrl("");
    setNewLinkLabel("");
    setNewLinkIsInstallment(false);
    setNewLinkParentId("");
  };

  const handleAddGroup = async () => {
    if (!newGroupName || !newGroupLinkId) return;
    await addGroup({
      name: newGroupName,
      link_id: newGroupLinkId as any,
    });
    setNewGroupName("");
    setNewGroupLinkId("");
  };

  const handleReset = async () => {
    const confirmation = window.prompt("Tapez RESET pour réinitialiser la saison (supprime inscrits et statuts)");
    if (confirmation === "RESET") {
      await resetSeason();
      alert("Saison réinitialisée.");
    }
  };

  if (links === undefined || groups === undefined) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Configuration HelloAsso</h1>

      <section className="mb-8 p-4 bg-white rounded shadow">
        <h2 className="text-xl font-bold mb-4">Liens HelloAsso</h2>
        <ul className="mb-4">
          {links.map((link: any) => (
            <li key={link._id} className="flex justify-between items-center p-2 border-b">
              <div>
                <strong>{link.label}</strong> {link.is_installment ? "(3x)" : "(1x)"}
                <br />
                <a href={link.url} target="_blank" rel="noreferrer" className="text-sm text-blue-500">{link.url}</a>
              </div>
              <button onClick={() => deleteLink({ id: link._id })} className="text-red-500 text-sm">Supprimer</button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t pt-4">
          <input type="text" placeholder="Label (ex: Tarif 280€)" value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} className="border p-2" />
          <input type="text" placeholder="URL HelloAsso" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} className="border p-2" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={newLinkIsInstallment} onChange={e => setNewLinkIsInstallment(e.target.checked)} />
            Paiement en 3x
          </label>
          {newLinkIsInstallment && (
            <select value={newLinkParentId} onChange={e => setNewLinkParentId(e.target.value)} className="border p-2">
              <option value="">-- Sélectionnez le lien parent (1x) --</option>
              {links.filter((l: any) => !l.is_installment).map((l: any) => (
                <option key={l._id} value={l._id}>{l.label}</option>
              ))}
            </select>
          )}
          <button onClick={handleAddLink} className="bg-blue-600 text-white p-2 rounded w-fit">Ajouter le lien</button>
        </div>
      </section>

      <section className="mb-8 p-4 bg-white rounded shadow">
        <h2 className="text-xl font-bold mb-4">Groupes d'escalade</h2>
        <ul className="mb-4">
          {groups.map((group: any) => {
            const link = links.find((l: any) => l._id === group.link_id);
            return (
              <li key={group._id} className="flex justify-between items-center p-2 border-b">
                <div>
                  <strong>{group.name}</strong>
                  <br />
                  <span className="text-sm text-gray-500">Lien associé : {link?.label}</span>
                </div>
                <button onClick={() => deleteGroup({ id: group._id })} className="text-red-500 text-sm">Supprimer</button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2 border-t pt-4">
          <input type="text" placeholder="Nom du groupe (ex: 5-6 ans)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="border p-2" />
          <select value={newGroupLinkId} onChange={e => setNewGroupLinkId(e.target.value)} className="border p-2">
            <option value="">-- Sélectionnez le lien principal (1x) --</option>
            {links.filter((l: any) => !l.is_installment).map((l: any) => (
              <option key={l._id} value={l._id}>{l.label}</option>
            ))}
          </select>
          <button onClick={handleAddGroup} className="bg-blue-600 text-white p-2 rounded w-fit">Ajouter le groupe</button>
        </div>
      </section>

      <section className="p-4 bg-red-50 rounded shadow border border-red-200">
        <h2 className="text-xl font-bold text-red-600 mb-2">Zone dangereuse</h2>
        <p className="text-sm text-gray-600 mb-4">Réinitialise les inscrits et l'historique des statuts. Les liens et les groupes sont conservés.</p>
        <button onClick={handleReset} className="bg-red-600 text-white p-2 rounded">Réinitialiser la saison</button>
      </section>
    </div>
  );
}
