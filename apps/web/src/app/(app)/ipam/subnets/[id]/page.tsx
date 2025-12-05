"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiPut } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';

type Subnet = { id: string; name: string; cidr: string };
type Address = { subnetId: string; address: string; hostname?: string | null; status?: 'ASSIGNED' | 'RESERVED' };

export default function SubnetDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const token = typeof window !== 'undefined' ? getToken() : null;
  const [subnet, setSubnet] = useState<Subnet | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState('');
  const [hostname, setHostname] = useState('');
  const [status, setStatus] = useState<'ASSIGNED' | 'RESERVED'>('ASSIGNED');
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCidr, setEditCidr] = useState('');

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          setIsAdminOrTech(memberships.some((m) => m.role === 'ADMIN' || m.role === 'TECHNICIAN'));
        } catch { setIsAdminOrTech(false); }
      }
      const s = await apiGet<Subnet>(`/ipam/subnets/${id}`, token);
      setSubnet(s || null);
      if (s) { setEditName((s as any).name || ''); setEditDescription((s as any).description || ''); setEditCidr((s as any).cidr || ''); }
      const a = await apiGet<Address[]>(`/ipam/addresses?subnetId=${id}`, token);
      setAddresses(Array.isArray(a) ? a : []);
    })();
  }, [token, id]);

  const addAddress = async () => {
    if (!token || !address) return;
    const res = await apiPost<{ id: string }>(`/ipam/addresses`, token, { subnetId: id, address, hostname: hostname || undefined, status });
    if (res && res.id) {
      const a = await apiGet<Address[]>(`/ipam/addresses?subnetId=${id}`, token);
      setAddresses(Array.isArray(a) ? a : []);
      setAddress('');
      setHostname('');
    }
  };

  const removeAddress = async (addr: string) => {
    if (!token) return;
    await apiDelete(`/ipam/addresses?subnetId=${id}&address=${encodeURIComponent(addr)}`, token);
    const a = await apiGet<Address[]>(`/ipam/addresses?subnetId=${id}`, token);
    setAddresses(Array.isArray(a) ? a : []);
  };

  const saveSubnet = async () => {
    if (!token) return;
    await apiPut(`/ipam/subnets/${id}`, token, { name: editName, cidr: editCidr, description: editDescription || undefined });
    const s = await apiGet<Subnet>(`/ipam/subnets/${id}`, token);
    setSubnet(s || null);
  };

  const deleteSubnet = async () => {
    if (!token) return;
    await apiDelete(`/ipam/subnets/${id}`, token);
    router.push('/ipam');
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Subnet</h1>
        <button onClick={() => router.back()} className="px-3 py-2 rounded bg-border text-text">Voltar</button>
      </div>
      {subnet && (
        <div className="mb-4">
          <div className="text-lg">{subnet.name}</div>
          <div className="text-sm text-muted">{subnet.cidr}</div>
          {isAdminOrTech && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">Nome</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div>
                <label className="block text-sm mb-1">CIDR</label>
                <input value={editCidr} onChange={(e) => setEditCidr(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: 192.168.1.0/24" />
              </div>
              <div>
                <label className="block text-sm mb-1">Descrição</label>
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={saveSubnet} className="px-4 py-2 bg-primary text-white rounded">Salvar</button>
                <button onClick={deleteSubnet} className="px-4 py-2 bg-red-600 text-white rounded">Excluir</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isAdminOrTech && (<div className="bg-card border border-border rounded p-4">
          <div className="mb-3">
            <label className="block text-sm mb-1">IP</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: 192.168.10.5" />
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Hostname</label>
            <input value={hostname} onChange={(e) => setHostname(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Opcional" />
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full border border-border rounded px-2 py-2">
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="RESERVED">RESERVED</option>
            </select>
          </div>
          <button onClick={addAddress} className="px-4 py-2 bg-primary text-white rounded">Adicionar</button>
        </div>)}

        <div className="md:col-span-2 bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Endereços</h2></div>
          {addresses.length === 0 ? (
            <div className="text-sm text-muted">Nenhum endereço cadastrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Endereço</th>
                  <th className="py-2">Hostname</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {addresses.map((a) => (
                  <tr key={a.address} className="border-b border-border">
                    <td className="py-2">{a.address}</td>
                    <td className="py-2">{a.hostname || ''}</td>
                    <td className="py-2">{a.status || 'ASSIGNED'}</td>
                  <td className="py-2">
                    {isAdminOrTech && (
                      <button onClick={() => removeAddress(a.address)} className="px-2 py-1 bg-red-600 text-white rounded">Remover</button>
                    )}
                  </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
