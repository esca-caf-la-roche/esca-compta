import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Save, Star, Trash2, Users, Calendar, Shield, Edit2, X, Check } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

export default function Configurations() {
  const [activeTab, setActiveTab] = useState<"saisons" | "utilisateurs">("saisons");

  // Saisons
  const saisons = useQuery(api.saisons.get);
  const createSaison = useMutation(api.saisons.create);
  const updateSaison = useMutation(api.saisons.update);
  const removeSaison = useMutation(api.saisons.remove);
  const [newSaisonName, setNewSaisonName] = useState("");
  const [isSubmittingSaison, setIsSubmittingSaison] = useState(false);

  // Utilisateurs
  const users = useQuery(api.users.listUsers);
  const addUser = useMutation(api.users.addUser);
  const removeUser = useMutation(api.users.removeUser);
  const updateUserSettings = useMutation(api.users.updateUserSettings);
  
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  
  const [editingUserId, setEditingUserId] = useState<Id<"users"> | null>(null);
  const [editRole, setEditRole] = useState<string>("user");
  const [editTiles, setEditTiles] = useState<string[]>([]);

  // Saisons handlers
  const handleAddSaison = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSaisonName.trim();
    if (!name) return;

    if (saisons?.some(s => s.nom === name)) {
      alert("Cette saison existe déjà.");
      return;
    }

    setIsSubmittingSaison(true);
    try {
      await createSaison({ nom: name, isDefault: false });
      setNewSaisonName("");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'ajout.");
    } finally {
      setIsSubmittingSaison(false);
    }
  };

  const handleSetDefault = async (id: Id<"saisons">) => {
    try {
      await updateSaison({ id, isDefault: true });
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour.");
    }
  };

  const handleDeleteSaison = async (id: Id<"saisons">) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette saison ? Elle ne doit contenir aucune donnée.")) {
      try {
        await removeSaison({ id });
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Erreur lors de la suppression.");
      }
    }
  };

  // Utilisateurs handlers
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newUserEmail.trim();
    if (!email) return;

    setIsSubmittingUser(true);
    try {
      await addUser({ email, name: newUserName.trim() || undefined });
      setNewUserEmail("");
      setNewUserName("");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur lors de l'ajout.");
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleDeleteUser = async (id: Id<"users">) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ? Il ne pourra plus se connecter.")) {
      try {
        await removeUser({ userId: id });
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Erreur lors de la suppression.");
      }
    }
  };

  const startEditingUser = (user: any) => {
    setEditingUserId(user._id);
    setEditRole(user.settings?.role || "user");
    setEditTiles(user.settings?.allowedTiles || []);
  };

  const saveUserEdit = async (userId: Id<"users">) => {
    try {
      await updateUserSettings({
        userId,
        role: editRole,
        allowedTiles: editTiles,
      });
      setEditingUserId(null);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur lors de la mise à jour.");
    }
  };

  const toggleEditTile = (tileId: string) => {
    setEditTiles(prev => 
      prev.includes(tileId) ? prev.filter(t => t !== tileId) : [...prev, tileId]
    );
  };

  const TILE_OPTIONS = [
    { id: "compta", label: "Comptabilité" },
    { id: "paiements", label: "Paiements Escalade" },
  ];

  return (
    <div className="configurations-page fade-in" style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <header className="page-header" style={{ marginBottom: "2rem" }}>
        <h1>Configurations</h1>
        <p className="subtitle">Gérez les paramètres globaux de l'application.</p>
      </header>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.5rem" }}>
        <button 
          onClick={() => setActiveTab("saisons")}
          style={{ 
            background: "transparent", 
            border: "none", 
            padding: "0.5rem 1rem", 
            fontSize: "1.1rem", 
            fontWeight: "bold", 
            cursor: "pointer",
            color: activeTab === "saisons" ? "#000" : "#6b7280",
            borderBottom: activeTab === "saisons" ? "3px solid #000" : "3px solid transparent",
            display: "flex", alignItems: "center", gap: "0.5rem"
          }}
        >
          <Calendar size={18} /> Saisons
        </button>
        <button 
          onClick={() => setActiveTab("utilisateurs")}
          style={{ 
            background: "transparent", 
            border: "none", 
            padding: "0.5rem 1rem", 
            fontSize: "1.1rem", 
            fontWeight: "bold", 
            cursor: "pointer",
            color: activeTab === "utilisateurs" ? "#000" : "#6b7280",
            borderBottom: activeTab === "utilisateurs" ? "3px solid #000" : "3px solid transparent",
            display: "flex", alignItems: "center", gap: "0.5rem"
          }}
        >
          <Users size={18} /> Utilisateurs et Accès
        </button>
      </div>

      {activeTab === "saisons" && (
        <div className="tab-content fade-in">
          <div className="card glass-card" style={{ marginBottom: "2rem" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Calendar size={20} /> Ajouter une saison
            </h2>
            <form onSubmit={handleAddSaison} style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Nom de la saison (ex: 2027-28)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: 2027-28"
                  value={newSaisonName}
                  onChange={e => setNewSaisonName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isSubmittingSaison} style={{ whiteSpace: "nowrap", height: "42px" }}>
                <Save size={16} style={{ marginRight: "0.5rem" }} /> Ajouter
              </button>
            </form>
          </div>

          <div className="card glass-card">
            <h2 style={{ marginBottom: "1rem" }}>Saisons existantes</h2>
            {saisons === undefined ? (
              <div>Chargement...</div>
            ) : (
              <div className="saisons-list" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {saisons.map((saison) => (
                  <div key={saison._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{saison.nom}</span>
                    
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      {saison.isDefault ? (
                        <span className="badge" style={{ backgroundColor: "#fef08a", color: "#854d0e", display: "flex", alignItems: "center", gap: "0.25rem", boxShadow: "2px 2px 0px 0px #000" }}>
                          <Star size={14} fill="currentColor" /> Par défaut
                        </span>
                      ) : (
                        <button 
                          className="btn-secondary info" 
                          onClick={() => handleSetDefault(saison._id)}
                          style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}
                        >
                          Définir par défaut
                        </button>
                      )}
                      
                      {!saison.isDefault && (
                        <button 
                          className="btn-icon danger" 
                          onClick={() => handleDeleteSaison(saison._id)}
                          title="Supprimer"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "utilisateurs" && (
        <div className="tab-content fade-in">
          <div className="card glass-card" style={{ marginBottom: "2rem" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Shield size={20} /> Ajouter un utilisateur
            </h2>
            <form onSubmit={handleAddUser} style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label className="form-label">Email autorisé</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="nom@exemple.com"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  required
                />
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label className="form-label">Nom (Optionnel)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Jean Dupont"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isSubmittingUser} style={{ whiteSpace: "nowrap", height: "42px" }}>
                <Save size={16} style={{ marginRight: "0.5rem" }} /> Ajouter
              </button>
            </form>
          </div>

          <div className="card glass-card" style={{ overflowX: "auto" }}>
            <h2 style={{ marginBottom: "1rem" }}>Utilisateurs existants</h2>
            {users === undefined ? (
              <div>Chargement...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Email</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Nom</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Rôle</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Tuiles autorisées</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "0.75rem 0.5rem" }}>{user.email}</td>
                      <td style={{ padding: "0.75rem 0.5rem" }}>{user.name || "-"}</td>
                      
                      {editingUserId === user._id ? (
                        <>
                          <td style={{ padding: "0.75rem 0.5rem" }}>
                            <select 
                              className="input-field" 
                              value={editRole} 
                              onChange={e => setEditRole(e.target.value)}
                              style={{ padding: "0.25rem", width: "auto" }}
                            >
                              <option value="user">Utilisateur</option>
                              <option value="admin">Administrateur</option>
                            </select>
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                              {TILE_OPTIONS.map(tile => (
                                <label key={tile.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
                                  <input 
                                    type="checkbox" 
                                    checked={editTiles.includes(tile.id)}
                                    onChange={() => toggleEditTile(tile.id)}
                                  />
                                  {tile.label}
                                </label>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                              <button className="btn-icon success" onClick={() => saveUserEdit(user._id)} title="Enregistrer">
                                <Check size={18} />
                              </button>
                              <button className="btn-icon danger" onClick={() => setEditingUserId(null)} title="Annuler">
                                <X size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "0.75rem 0.5rem" }}>
                            <span className="badge" style={{ backgroundColor: user.settings?.role === "admin" ? "#dcfce7" : "#f3f4f6", color: user.settings?.role === "admin" ? "#166534" : "#374151" }}>
                              {user.settings?.role === "admin" ? "Admin" : "Utilisateur"}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                              {user.settings?.allowedTiles?.length ? (
                                user.settings.allowedTiles.map((tId: string) => {
                                  const label = TILE_OPTIONS.find(opt => opt.id === tId)?.label || tId;
                                  return (
                                    <span key={tId} className="badge" style={{ fontSize: "0.75rem", backgroundColor: "#e0f2fe", color: "#075985" }}>
                                      {label}
                                    </span>
                                  );
                                })
                              ) : (
                                <span style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "0.85rem" }}>Aucun accès</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                              <button className="btn-icon info" onClick={() => startEditingUser(user)} title="Modifier">
                                <Edit2 size={18} />
                              </button>
                              <button className="btn-icon danger" onClick={() => handleDeleteUser(user._id)} title="Supprimer">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
