"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiDelete } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type DeviceType = { id: string; name: string; description?: string | null; status: string };
type Brand = { id: string; name: string; description?: string | null; logoUrl?: string | null; status: string };
type Device = {
  id: string;
  model: string;
  deviceTypeId: string;
  brandId: string;
  uHeight?: number | null;
  deviceType?: DeviceType;
  brand?: Brand;
};

export default function DevicesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isTech, setIsTech] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [items, setItems] = useState<Device[]>([]);
  const [filteredItems, setFilteredItems] = useState<Device[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  
  // Filtros
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filterDeviceType, setFilterDeviceType] = useState<string>("");
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterModel, setFilterModel] = useState<string>("");

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token) {
      // Sem token, não conseguimos chamar a API; finalizar carregamento
      setIsAdmin(false);
      setIsTech(false);
      setLoading(false);
      return;
    }
    (async () => {
      // Checar permissões (não bloquear lista)
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          const isGlobalAdmin = !!res?.data?.isGlobalAdmin;
          setIsAdmin(isGlobalAdmin || memberships.some((m) => m.role === "ADMIN"));
          setIsTech(memberships.some((m) => m.role === "TECHNICIAN"));
        } catch {
          setIsAdmin(false);
          setIsTech(false);
        }
      } else {
        setIsAdmin(false);
        setIsTech(false);
      }

      // Carregar dispositivos (sempre que houver token)
      try {
        setLoadingItems(true);
        const devicesRes = await apiGet<{ ok: boolean; data?: Device[] }>(`/devices`, token);
        setItems(devicesRes?.data || []);
      } catch {
        setItems([]);
      } finally {
        setLoadingItems(false);
      }

      // Carregar filtros (em paralelo)
      try {
        const [typesRes, brandsRes] = await Promise.all([
          apiGet<{ ok: boolean; data?: DeviceType[] }>(`/device-types`, token),
          apiGet<{ ok: boolean; data?: Brand[] }>(`/brands`, token)
        ]);
        setDeviceTypes(typesRes?.data || []);
        setBrands(brandsRes?.data || []);
      } catch {
        setDeviceTypes([]);
        setBrands([]);
      }

      setLoading(false);
    })();
  }, []);

  // Efeito para aplicar filtros
  useEffect(() => {
    // Enriquecer itens com nomes de tipo e marca quando possível
    const enriched = items.map((item) => ({
      ...item,
      deviceType: item.deviceType || deviceTypes.find((t) => t.id === item.deviceTypeId) || undefined,
      brand: item.brand || brands.find((b) => b.id === item.brandId) || undefined,
    }));

    let filtered = enriched;
    
    if (filterDeviceType) {
      filtered = filtered.filter(item => item.deviceTypeId === filterDeviceType);
    }
    
    if (filterBrand) {
      filtered = filtered.filter(item => item.brandId === filterBrand);
    }
    
    if (filterModel.trim()) {
      const modelLower = filterModel.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.model.toLowerCase().includes(modelLower)
      );
    }
    
    setFilteredItems(filtered);
  }, [items, deviceTypes, brands, filterDeviceType, filterBrand, filterModel]);

  const canManage = isAdmin; // somente admins criam/editam/excluem

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    if (!window.confirm("Excluir este dispositivo?")) return;
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/devices/${id}`, token);
      if (!res?.ok) {
        alert(res?.error || "Falha ao excluir dispositivo.");
        return;
      }
      // Atualizar lista após excluir
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      alert("Falha ao comunicar com a API.");
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Dispositivos</h1>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Link href="/configuracoes/dispositivos/nova" className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90">Novo dispositivo</Link>
          </div>
        ) : (
          <div className="text-sm text-muted">Visualização somente (técnicos e clientes)</div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted">Carregando permissões…</div>
      ) : (
        <div className="bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted">Inventário de dispositivos</div>
            <button
              className="text-xs underline"
              onClick={async () => {
                const token = getToken();
                if (!token) return;
                setLoadingItems(true);
                try {
                  const [devicesRes, typesRes, brandsRes] = await Promise.all([
                    apiGet<{ ok: boolean; data?: Device[] }>(`/devices`, token),
                    apiGet<{ ok: boolean; data?: DeviceType[] }>(`/device-types`, token),
                    apiGet<{ ok: boolean; data?: Brand[] }>(`/brands`, token),
                  ]);
                  setItems(devicesRes?.data || []);
                  setDeviceTypes(typesRes?.data || []);
                  setBrands(brandsRes?.data || []);
                } catch {
                  setItems([]);
                } finally {
                  setLoadingItems(false);
                }
              }}
            >Atualizar lista</button>
          </div>
          
          {/* Filtros */}
          <div className="grid md:grid-cols-4 gap-3 mb-4 p-3 bg-muted/30 rounded border">
            <div>
              <label className="block text-xs text-muted mb-1">Filtrar por Tipo</label>
              <select 
                value={filterDeviceType} 
                onChange={(e) => setFilterDeviceType(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1"
              >
                <option value="">Todos os tipos</option>
                {deviceTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Filtrar por Marca</label>
              <select 
                value={filterBrand} 
                onChange={(e) => setFilterBrand(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1"
              >
                <option value="">Todas as marcas</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Filtrar por Modelo</label>
              <input
                type="text"
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                placeholder="Digite parte do modelo..."
                className="w-full text-xs border border-border rounded px-2 py-1"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterDeviceType("");
                  setFilterBrand("");
                  setFilterModel("");
                }}
                className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
              >
                Limpar filtros
              </button>
            </div>
          </div>
          {loadingItems ? (
            <div className="text-sm text-muted mt-2">Carregando dispositivos…</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-sm text-muted mt-2">
              {items.length === 0 ? "Nenhum dispositivo encontrado." : "Nenhum dispositivo corresponde aos filtros aplicados."}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-2 pr-4">Modelo</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Marca</th>
                    <th className="py-2 pr-4">Altura (U)</th>
                    <th className="py-2 pr-4">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => (
                    <tr key={it.id} className="border-b border-border">
                      <td className="py-1 pr-4">{it.model || "—"}</td>
                      <td className="py-1 pr-4">{it.deviceType?.name || deviceTypes.find(t => t.id === it.deviceTypeId)?.name || (it.deviceTypeId ? it.deviceTypeId.slice(0, 8) : '—')}</td>
                      <td className="py-1 pr-4">{it.brand?.name || brands.find(b => b.id === it.brandId)?.name || (it.brandId ? it.brandId.slice(0, 8) : '—')}</td>
                      <td className="py-1 pr-4">{typeof it.uHeight === 'number' ? it.uHeight : "—"}</td>
                      <td className="py-1 pr-4">
                        {canManage ? (
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/configuracoes/dispositivos/${it.id}`}
                              className="px-2 py-1 text-xs rounded border border-border hover:bg-muted"
                            >Visualizar</Link>
                            <Link
                              href={`/configuracoes/dispositivos/${it.id}/editar`}
                              className="px-2 py-1 text-xs rounded bg-primary text-white hover:bg-primary/90"
                            >Editar</Link>
                            <button
                              onClick={() => handleDelete(it.id)}
                              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                            >Excluir</button>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-sm">
        <Link href="/configuracoes" className="underline hover:opacity-80">Voltar para Configurações</Link>
      </div>
    </div>
  );
}
