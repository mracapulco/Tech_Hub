"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type DeviceType = { id: string; name: string; description?: string | null; status: string };
type Brand = { id: string; name: string; status: string };

export default function NewDevicePage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(true);

  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingTypes, setLoadingTypes] = useState<boolean>(false);
  const [loadingBrands, setLoadingBrands] = useState<boolean>(false);

  const [deviceTypeId, setDeviceTypeId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [uHeight, setUHeight] = useState<string>("");
  const [isFullDepth, setIsFullDepth] = useState<boolean>(true);
  const [frontImage, setFrontImage] = useState<boolean>(false);
  const [rearImage, setRearImage] = useState<boolean>(false);
  const [weight, setWeight] = useState<string>("");
  const [weightUnit, setWeightUnit] = useState<string>("kg");
  const airflowOptions = [
    { value: "front-to-rear", label: "Frente para traseira" },
    { value: "rear-to-front", label: "Traseira para frente" },
    { value: "left-to-right", label: "Esquerda para direita" },
    { value: "right-to-left", label: "Direita para esquerda" },
    { value: "passive", label: "Passivo" },
  ];
  const [airflow, setAirflow] = useState<string>("");

  const [consolePorts, setConsolePorts] = useState<Array<{ name: string; type: string }>>([]);
  const [interfaces, setInterfaces] = useState<Array<{ name: string; type: string; mgmt_only?: boolean }>>([]);
  const [moduleBays, setModuleBays] = useState<Array<{ name: string; label?: string; position?: string }>>([]);

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      setIsAdmin(false);
      setLoadingPerms(false);
      return;
    }
    (async () => {
      try {
        const ur = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (ur?.data?.memberships || []) as { role: string }[];
        const _isAdmin = memberships.some((m) => m.role === "ADMIN");
        setIsAdmin(_isAdmin);
      } catch {}
      setLoadingPerms(false);
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    setLoadingTypes(true);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: DeviceType[]; error?: string }>(`/device-types`, token);
        setDeviceTypes(res?.data || []);
      } catch {}
      setLoadingTypes(false);
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (!deviceTypeId) {
      setBrands([]);
      setBrandId("");
      return;
    }
    setLoadingBrands(true);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Brand[] }>(`/brands?deviceTypeId=${deviceTypeId}`, token);
        setBrands(res?.data || []);
      } catch {}
      setLoadingBrands(false);
    })();
  }, [deviceTypeId]);

  const selectedBrandName = useMemo(() => brands.find((b) => b.id === brandId)?.name ?? "", [brands, brandId]);

  function handleModelChange(v: string) {
    setModel(v);
  }

  async function handleSave() {
    setError(null);
    setMsg(null);
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!deviceTypeId) return setError("Selecione o Tipo de dispositivo.");
    if (!brandId) return setError("Selecione a Marca filtrada pelo Tipo.");
    if (!model.trim()) return setError("Informe o modelo.");
    const payload = {
      deviceTypeId,
      brandId,
      model: model.trim(),
      uHeight: uHeight ? Number(uHeight) : null,
      isFullDepth,
      frontImage,
      rearImage,
      weight: weight ? Number(weight) : null,
      weightUnit: weightUnit || "kg",
      airflow: airflow || null,
      consolePorts,
      interfaces,
      moduleBays,
      status: "ACTIVE",
    };
    setSaving(true);
    try {
      const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/devices`, token, payload);
      if (!res?.ok) {
        setError(res?.error || "Erro ao salvar dispositivo.");
      } else {
        setMsg("Dispositivo criado com sucesso.");
        router.push(`/configuracoes/dispositivos`);
      }
    } catch (e: any) {
      setError("Falha ao criar dispositivo.");
    } finally {
      setSaving(false);
    }
  }



  const canManage = isAdmin;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Novo dispositivo</h1>
        <div className="text-sm">
          <Link href="/configuracoes/dispositivos" className="underline hover:opacity-80">Voltar</Link>
        </div>
      </div>

      {loadingPerms ? (
        <div className="text-sm text-muted">Carregando permissões…</div>
      ) : !canManage ? (
        <div className="bg-card border border-border rounded p-4 text-sm">Acesso restrito. Somente Admin pode cadastrar dispositivos.</div>
      ) : (
        <div className="bg-card border border-border rounded p-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Tipo de dispositivo</label>
              <select value={deviceTypeId} onChange={(e) => setDeviceTypeId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
                <option value="">Selecione…</option>
                {deviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {loadingTypes ? <div className="text-xs text-muted mt-1">Carregando tipos…</div> : null}
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Marca (filtrada pelo Tipo)</label>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full border border-border rounded px-2 py-2" disabled={!deviceTypeId}>
                <option value="">Selecione…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {loadingBrands ? <div className="text-xs text-muted mt-1">Carregando marcas…</div> : null}
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Modelo</label>
              <input className="w-full border border-border rounded px-2 py-2" value={model} onChange={(e) => handleModelChange(e.target.value)} />
            </div>
            {/* Campo Slug removido conforme solicitado */}

            <div>
              <label className="block text-xs text-muted mb-1">Altura (U)</label>
              <input className="w-full border border-border rounded px-2 py-2" value={uHeight} onChange={(e) => setUHeight(e.target.value)} placeholder="ex.: 1" />
            </div>
            <div className="flex items-center gap-2">
              <label className="block text-xs text-muted">Profundidade total</label>
              <input type="checkbox" checked={isFullDepth} onChange={(e) => setIsFullDepth(e.target.checked)} />
            </div>

            <div className="flex items-center gap-2">
              <label className="block text-xs text-muted">Imagem frontal</label>
              <input type="checkbox" checked={frontImage} onChange={(e) => setFrontImage(e.target.checked)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="block text-xs text-muted">Imagem traseira</label>
              <input type="checkbox" checked={rearImage} onChange={(e) => setRearImage(e.target.checked)} />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Peso</label>
              <input className="w-full border border-border rounded px-2 py-2" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="ex.: 18.5" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Unidade de peso</label>
              <select className="w-full border border-border rounded px-2 py-2" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">Fluxo de ar</label>
              <select className="w-full border border-border rounded px-2 py-2" value={airflow} onChange={(e) => setAirflow(e.target.value)}>
                <option value="">Selecione…</option>
                {airflowOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">Console ports</label>
              <div className="space-y-2">
                {consolePorts.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2">
                    <input className="border border-border rounded px-2 py-1" placeholder="Nome" value={p.name} onChange={(e) => {
                      const arr = [...consolePorts]; arr[idx] = { ...arr[idx], name: e.target.value }; setConsolePorts(arr);
                    }} />
                    <input className="border border-border rounded px-2 py-1" placeholder="Tipo" value={p.type} onChange={(e) => {
                      const arr = [...consolePorts]; arr[idx] = { ...arr[idx], type: e.target.value }; setConsolePorts(arr);
                    }} />
                  </div>
                ))}
                <button type="button" className="px-2 py-1 text-sm rounded border border-border hover:bg-muted" onClick={() => setConsolePorts([...consolePorts, { name: "", type: "" }])}>Adicionar porta</button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">Interfaces</label>
              <div className="space-y-2">
                {interfaces.map((i, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2">
                    <input className="border border-border rounded px-2 py-1" placeholder="Nome" value={i.name} onChange={(e) => {
                      const arr = [...interfaces]; arr[idx] = { ...arr[idx], name: e.target.value }; setInterfaces(arr);
                    }} />
                    <input className="border border-border rounded px-2 py-1" placeholder="Tipo" value={i.type} onChange={(e) => {
                      const arr = [...interfaces]; arr[idx] = { ...arr[idx], type: e.target.value }; setInterfaces(arr);
                    }} />
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={Boolean(i.mgmt_only)} onChange={(e) => {
                        const arr = [...interfaces]; arr[idx] = { ...arr[idx], mgmt_only: e.target.checked }; setInterfaces(arr);
                      }} />
                      Apenas gerenciamento
                    </label>
                  </div>
                ))}
                <button type="button" className="px-2 py-1 text-sm rounded border border-border hover:bg-muted" onClick={() => setInterfaces([...interfaces, { name: "", type: "", mgmt_only: false }])}>Adicionar interface</button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">Module bays</label>
              <div className="space-y-2">
                {moduleBays.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2">
                    <input className="border border-border rounded px-2 py-1" placeholder="Nome" value={m.name} onChange={(e) => {
                      const arr = [...moduleBays]; arr[idx] = { ...arr[idx], name: e.target.value }; setModuleBays(arr);
                    }} />
                    <input className="border border-border rounded px-2 py-1" placeholder="Label" value={m.label || ""} onChange={(e) => {
                      const arr = [...moduleBays]; arr[idx] = { ...arr[idx], label: e.target.value }; setModuleBays(arr);
                    }} />
                    <input className="border border-border rounded px-2 py-1" placeholder="Posição" value={m.position || ""} onChange={(e) => {
                      const arr = [...moduleBays]; arr[idx] = { ...arr[idx], position: e.target.value }; setModuleBays(arr);
                    }} />
                  </div>
                ))}
                <button type="button" className="px-2 py-1 text-sm rounded border border-border hover:bg-muted" onClick={() => setModuleBays([...moduleBays, { name: "", label: "", position: "" }])}>Adicionar bay</button>
              </div>
            </div>

            {/* seção de importação YAML removida */}
          </div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          {msg ? <div className="mt-3 text-sm text-green-700">{msg}</div> : null}

          <div className="mt-4 flex items-center gap-2">
            <button disabled={saving} className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50" onClick={handleSave}>Salvar dispositivo</button>
            <span className="text-xs text-muted">Marca selecionada: {selectedBrandName || "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}