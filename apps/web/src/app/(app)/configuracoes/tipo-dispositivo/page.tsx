"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type DeviceType = { id: string; name: string; description?: string | null; status: string };

export default function DeviceTypePage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isTech, setIsTech] = useState<boolean>(false);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(true);
  const [items, setItems] = useState<DeviceType[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [msgList, setMsgList] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<boolean>(false);
  const [newForm, setNewForm] = useState<{ name: string; description: string }>({ name: "", description: "" });
  const [savingNew, setSavingNew] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; status: string }>({ name: "", description: "", status: "ACTIVE" });
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      setIsAdmin(false);
      setIsTech(false);
      setLoadingPerms(false);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (res?.data?.memberships || []) as { role: string }[];
        setIsAdmin(memberships.some((m) => m.role === "ADMIN"));
        setIsTech(memberships.some((m) => m.role === "TECHNICIAN"));
      } catch {
        setIsAdmin(false);
        setIsTech(false);
      } finally {
        setLoadingPerms(false);
      }
    })();
  }, []);

  async function fetchList() {
    const token = getToken();
    if (!token) {
      setMsgList("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingList(true);
    const res = await apiGet<{ ok: boolean; data?: DeviceType[]; error?: string }>(`/device-types`, token);
    setLoadingList(false);
    if (!res?.ok) {
      setMsgList(res?.error || "Falha ao carregar tipos.");
      return;
    }
    setItems(res.data || []);
    setMsgList(null);
  }

  useEffect(() => {
    // carrega lista após resolver permissões (token válido)
    if (!loadingPerms) {
      fetchList();
    }
  }, [loadingPerms]);

  const canManage = isAdmin; // Admin pode CRUD; demais apenas leitura

  async function handleCreate() {
    const token = getToken();
    if (!token) return;
    if (!newForm.name.trim()) {
      alert("Informe um nome para o tipo.");
      return;
    }
    setSavingNew(true);
    const res = await apiPost<{ ok: boolean; data?: DeviceType; error?: string }>(`/device-types`, token, {
      name: newForm.name.trim(),
      description: newForm.description.trim() || undefined,
    });
    setSavingNew(false);
    if (!res?.ok) {
      alert(res?.error || "Falha ao criar tipo.");
      return;
    }
    setShowNew(false);
    setNewForm({ name: "", description: "" });
    await fetchList();
  }

  async function startEdit(item: DeviceType) {
    setEditingId(item.id);
    setEditForm({ name: item.name || "", description: item.description || "", status: item.status || "ACTIVE" });
  }

  async function handleUpdate() {
    const token = getToken();
    if (!token || !editingId) return;
    if (!editForm.name.trim()) {
      alert("Informe um nome.");
      return;
    }
    setSavingEdit(true);
    const res = await apiPut<{ ok: boolean; data?: DeviceType; error?: string }>(`/device-types/${editingId}`, token, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      status: editForm.status.trim() || "ACTIVE",
    });
    setSavingEdit(false);
    if (!res?.ok) {
      alert(res?.error || "Falha ao atualizar tipo.");
      return;
    }
    setEditingId(null);
    await fetchList();
  }

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    if (!window.confirm("Excluir este tipo de dispositivo?")) return;
    const res = await apiDelete<{ ok: boolean; error?: string }>(`/device-types/${id}`, token);
    if (!res?.ok) {
      alert(res?.error || "Falha ao excluir tipo.");
      return;
    }
    await fetchList();
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Tipo de dispositivo</h1>
        {canManage ? (
          <div className="flex items-center gap-2">
            {!showNew ? (
              <button onClick={() => setShowNew(true)} className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90">Novo tipo</button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={newForm.name}
                  onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome"
                  className="border border-border rounded px-2 py-1 text-sm"
                />
                <input
                  value={newForm.description}
                  onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Descrição (opcional)"
                  className="border border-border rounded px-2 py-1 text-sm"
                />
                <button disabled={savingNew} onClick={handleCreate} className="px-3 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">Salvar</button>
                <button onClick={() => { setShowNew(false); setNewForm({ name: "", description: "" }); }} className="px-3 py-1 rounded bg-muted text-foreground hover:opacity-80">Cancelar</button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted">Visualização somente (técnicos e clientes)</div>
        )}
      </div>

      {loadingPerms ? (
        <div className="text-sm text-muted">Carregando permissões…</div>
      ) : (
        <div className="bg-card border border-border rounded p-4">
          <div className="text-sm text-muted mb-2">Catálogo simples de tipos: ex. Nobreak, Servidor, Rack, Switch.</div>

          {loadingList ? (
            <div className="text-sm text-muted">Carregando tipos…</div>
          ) : msgList ? (
            <div className="text-sm text-red-600">{msgList}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Nome</th>
                  <th className="py-2 pr-2">Descrição</th>
                  <th className="py-2 pr-2">Status</th>
                  {canManage && <th className="py-2 pr-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-2 pr-2">
                      {editingId === item.id ? (
                        <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm w-full" />
                      ) : (
                        <span>{item.name}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {editingId === item.id ? (
                        <input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm w-full" />
                      ) : (
                        <span className="text-muted">{item.description || ""}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {editingId === item.id ? (
                        <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm">
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="INACTIVE">INACTIVE</option>
                        </select>
                      ) : (
                        <span className="text-muted">{item.status}</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-2 pr-2">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <button disabled={savingEdit} onClick={handleUpdate} className="px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">Salvar</button>
                            <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded bg-muted text-foreground hover:opacity-80">Cancelar</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Link href={`/configuracoes/tipo-dispositivo/${item.id}`} className="px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">Visualizar</Link>
                            <button onClick={() => startEdit(item)} className="px-2 py-1 rounded bg-muted text-foreground hover:opacity-80">Editar</button>
                            <button onClick={() => handleDelete(item.id)} className="px-2 py-1 rounded bg-error text-white hover:bg-error/90">Excluir</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="py-3 text-muted">Nenhum tipo cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-4 text-sm">
        <Link href="/configuracoes" className="underline hover:opacity-80">Voltar para Configurações</Link>
      </div>
    </div>
  );
}