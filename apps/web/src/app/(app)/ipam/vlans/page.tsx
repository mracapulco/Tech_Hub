"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Company = { id: string; name: string };
type Site = { id: string; name: string };
type Vlan = { id: string; siteId: string; number: number; name: string; purpose?: string | null };

export default function VlansPage() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editName, setEditName] = useState('');
  const [editPurpose, setEditPurpose] = useState('');

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          const isGlobalAdmin = !!res?.data?.isGlobalAdmin;
          setIsAdminOrTech(isGlobalAdmin || memberships.some((m) => m.role === 'ADMIN' || m.role === 'TECHNICIAN'));
        } catch { setIsAdminOrTech(false); }
      }
      const res = await apiGet<{ ok: boolean; data: any[] }>(`/companies`, token);
      if (res?.ok) setCompanies(res.data.map((c: any) => ({ id: c.id, name: c.name })));
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      if (!token || !companyId) { setSites([]); setSiteId(''); return; }
      const res = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
      if (Array.isArray(res)) setSites(res);
    })();
  }, [token, companyId]);

  useEffect(() => {
    (async () => {
      if (!token || !siteId) { setVlans([]); return; }
      const res = await apiGet<Vlan[]>(`/vlans?siteId=${siteId}`, token);
      if (Array.isArray(res)) setVlans(res);
    })();
  }, [token, siteId]);

  const onCreate = async () => {
    if (!token || !siteId || !number || !name) return;
    const created = await apiPost<Vlan>(`/vlans`, token, { siteId, number: Number(number), name, purpose: purpose || undefined });
    if (created && created.id) {
      setNumber(''); setName(''); setPurpose('');
      const res = await apiGet<Vlan[]>(`/vlans?siteId=${siteId}`, token);
      if (Array.isArray(res)) setVlans(res);
    }
  };

  const startEdit = (v: Vlan) => {
    setEditingId(v.id);
    setEditNumber(String(v.number));
    setEditName(v.name);
    setEditPurpose(v.purpose || '');
  };

  const saveEdit = async () => {
    if (!token || !editingId) return;
    await apiPut(`/vlans/${editingId}`, token, { number: Number(editNumber), name: editName, purpose: editPurpose || undefined });
    const res = await apiGet<Vlan[]>(`/vlans?siteId=${siteId}`, token);
    if (Array.isArray(res)) setVlans(res);
    setEditingId(''); setEditNumber(''); setEditName(''); setEditPurpose('');
  };

  const deleteVlan = async (id: string) => {
    if (!token) return;
    await apiDelete(`/vlans/${id}`, token);
    const res = await apiGet<Vlan[]>(`/vlans?siteId=${siteId}`, token);
    if (Array.isArray(res)) setVlans(res);
    if (editingId === id) { setEditingId(''); setEditNumber(''); setEditName(''); setEditPurpose(''); }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">VLANs</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded p-4">
          <div className="mb-3">
            <label className="block text-sm mb-1">Empresa</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Selecione...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Selecione...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Número</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: 10" />
          </div>)}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: Usuários" />
          </div>)}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Finalidade</label>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Opcional" />
          </div>)}
          {isAdminOrTech && (<button onClick={onCreate} disabled={!siteId || !number || !name} className="px-4 py-2 bg-primary text-white rounded">Criar VLAN</button>)}
        </div>

        <div className="md:col-span-2 bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Lista</h2>
          {vlans.length === 0 ? (
            <div className="text-sm text-muted">Nenhuma VLAN cadastrada.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Número</th>
                  <th className="py-2">Nome</th>
                  <th className="py-2">Finalidade</th>
                  {isAdminOrTech && <th className="py-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {vlans.map((v) => (
                  <tr key={v.id} className="border-b border-border">
                    <td className="py-2">{v.number}</td>
                    <td className="py-2">{v.name}</td>
                    <td className="py-2">{v.purpose || ''}</td>
                    {isAdminOrTech && (
                      <td className="py-2 space-x-2">
                        <button onClick={() => startEdit(v)} className="px-2 py-1 bg-primary text-white rounded">Editar</button>
                        <button onClick={() => deleteVlan(v.id)} className="px-2 py-1 bg-red-600 text-white rounded">Excluir</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isAdminOrTech && editingId && (
        <div className="mt-4 bg-card border border-border rounded p-4">
          <div className="font-semibold mb-2">Editar VLAN</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm mb-1">Número</label>
              <input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
            </div>
            <div>
              <label className="block text-sm mb-1">Nome</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
            </div>
            <div>
              <label className="block text-sm mb-1">Finalidade</label>
              <input value={editPurpose} onChange={(e) => setEditPurpose(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={saveEdit} className="px-4 py-2 bg-primary text-white rounded">Salvar</button>
              <button onClick={() => { setEditingId(''); setEditNumber(''); setEditName(''); setEditPurpose(''); }} className="px-4 py-2 bg-border text-text rounded">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
