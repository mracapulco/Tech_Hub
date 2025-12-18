"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Company = { id: string; name: string };
type Site = { id: string; name: string; city?: string | null; state?: string | null };

export default function SitesPage() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const [editId, setEditId] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editState, setEditState] = useState<string>('');
  const [editCompanyId, setEditCompanyId] = useState<string>('');

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
      if (!token || !companyId) { setSites([]); return; }
      const res = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
      if (Array.isArray(res)) setSites(res);
    })();
  }, [token, companyId]);

  const onCreate = async () => {
    if (!token || !companyId || !name) return;
    const created = await apiPost<Site>(`/sites`, token, { companyId, name, city: city || undefined, state: state || undefined });
    if (created && created.id) {
      setName(''); setCity(''); setState('');
      const res = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
      if (Array.isArray(res)) setSites(res);
    }
  };

  const startEdit = (s: Site) => {
    setEditId(s.id);
    setEditName(s.name || '');
    setEditCity(s.city || '');
    setEditState(s.state || '');
    setEditCompanyId(companyId);
  };

  const saveEdit = async () => {
    if (!token || !editId) return;
    await apiPut(`/sites/${editId}`, token, { companyId: editCompanyId || companyId, name: editName || undefined, city: editCity || undefined, state: editState || undefined });
    setEditId(''); setEditName(''); setEditCity(''); setEditState('');
    const res = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
    if (Array.isArray(res)) setSites(res);
  };

  const cancelEdit = () => { setEditId(''); setEditName(''); setEditCity(''); setEditState(''); };

  const removeSite = async (id: string) => {
    if (!token) return;
    await apiDelete(`/sites/${id}`, token);
    const res = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
    if (Array.isArray(res)) setSites(res);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Sites</h1>
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
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
          </div>)}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Cidade</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
          </div>)}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Estado</label>
            <input value={state} onChange={(e) => setState(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
          </div>)}
          {isAdminOrTech && (<button onClick={onCreate} disabled={!companyId || !name} className="px-4 py-2 bg-primary text-white rounded">Criar Site</button>)}
        </div>

        <div className="md:col-span-2 bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Lista</h2>
          {sites.length === 0 ? (
            <div className="text-sm text-muted">Nenhum site cadastrado.</div>
          ) : (
            <ul className="space-y-2">
              {sites.map((s) => (
                <li key={s.id} className="border border-border rounded p-2">
                  {editId === s.id ? (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <div>
                        <label className="block text-xs mb-1">Empresa</label>
                        <select value={editCompanyId} onChange={(e) => setEditCompanyId(e.target.value)} className="w-full border border-border rounded px-2 py-1 text-sm">
                          {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Nome</label>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border border-border rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Cidade</label>
                        <input value={editCity} onChange={(e) => setEditCity(e.target.value)} className="w-full border border-border rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Estado</label>
                        <input value={editState} onChange={(e) => setEditState(e.target.value)} className="w-full border border-border rounded px-2 py-1 text-sm" />
                      </div>
                      <div className="flex items-end gap-2">
                        <button onClick={saveEdit} className="px-3 py-1 bg-primary text-white rounded text-sm">Salvar</button>
                        <button onClick={cancelEdit} className="px-3 py-1 bg-border text-text rounded text-sm">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-sm text-muted">{[s.city, s.state].filter(Boolean).join(' - ')}</div>
                      {isAdminOrTech && (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => startEdit(s)} className="px-3 py-1 bg-primary text-white rounded text-xs">Editar</button>
                          <button onClick={() => removeSite(s.id)} className="px-3 py-1 bg-red-600 text-white rounded text-xs">Excluir</button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
