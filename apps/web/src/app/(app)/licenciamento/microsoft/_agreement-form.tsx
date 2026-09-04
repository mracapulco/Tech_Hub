"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  AgreementDraft,
  Company,
  Site,
  microsoftAgreementStatuses,
  microsoftBillingModelSuggestions,
  microsoftCategorySuggestions,
  microsoftLicenseTypeSuggestions,
} from "./_lib";

type Props = {
  token: string;
  companies: Company[];
  initialValue: AgreementDraft;
  mode: "create" | "edit";
  statusMessage?: { type: "success" | "error"; text: string } | null;
  submitLabel?: string;
  lockCompany?: boolean;
  onSubmit: (draft: AgreementDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export default function AgreementForm({
  token,
  companies,
  initialValue,
  mode,
  statusMessage,
  submitLabel,
  lockCompany,
  onSubmit,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState<AgreementDraft>(initialValue);
  const [sites, setSites] = useState<Site[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  useEffect(() => {
    (async () => {
      if (!token || !draft.companyId) {
        setSites([]);
        return;
      }
      const res = await apiGet<Site[] | { ok: boolean; error?: string }>(
        `/sites?companyId=${draft.companyId}`,
        token,
      );
      if (Array.isArray(res)) setSites(res);
      else setSites([]);
    })();
  }, [token, draft.companyId]);

  function setField<K extends keyof AgreementDraft>(key: K, value: AgreementDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded p-4">
      {statusMessage && (
        <div className={`mb-4 text-sm ${statusMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {statusMessage.text}
        </div>
      )}

      <datalist id="microsoft-category-options">
        {microsoftCategorySuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="microsoft-license-type-options">
        {microsoftLicenseTypeSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="microsoft-billing-options">
        {microsoftBillingModelSuggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Empresa</label>
          <select
            value={draft.companyId}
            onChange={(e) => setField("companyId", e.target.value)}
            disabled={lockCompany}
            className="w-full border border-border rounded px-3 py-2"
          >
            <option value="">Selecione...</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Unidade</label>
          <select
            value={draft.siteId || ""}
            onChange={(e) => setField("siteId", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          >
            <option value="">Opcional</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Categoria</label>
          <input
            value={draft.category}
            onChange={(e) => setField("category", e.target.value)}
            list="microsoft-category-options"
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Produto</label>
          <input
            value={draft.productName}
            onChange={(e) => setField("productName", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">SKU</label>
          <input
            value={draft.sku || ""}
            onChange={(e) => setField("sku", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Tipo de licença</label>
          <input
            value={draft.licenseType || ""}
            onChange={(e) => setField("licenseType", e.target.value)}
            list="microsoft-license-type-options"
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Canal</label>
          <input
            value={draft.licenseChannel || ""}
            onChange={(e) => setField("licenseChannel", e.target.value)}
            placeholder="CSP, EA, Volume, OEM..."
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Cobrança</label>
          <input
            value={draft.billingModel || ""}
            onChange={(e) => setField("billingModel", e.target.value)}
            list="microsoft-billing-options"
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Tenant</label>
          <input
            value={draft.tenantName || ""}
            onChange={(e) => setField("tenantName", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Domínio do tenant</label>
          <input
            value={draft.tenantDomain || ""}
            onChange={(e) => setField("tenantDomain", e.target.value)}
            placeholder="contoso.onmicrosoft.com"
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Quantidade comprada</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.quantityPurchased ?? ""}
            onChange={(e) => setField("quantityPurchased", e.target.value === "" ? null : Number(e.target.value))}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Quantidade ativa</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.quantityActive ?? ""}
            onChange={(e) => setField("quantityActive", e.target.value === "" ? null : Number(e.target.value))}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Custo unitário</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.unitCost ?? ""}
            onChange={(e) => setField("unitCost", e.target.value === "" ? null : Number(e.target.value))}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Custo total</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.totalCost ?? ""}
            onChange={(e) => setField("totalCost", e.target.value === "" ? null : Number(e.target.value))}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Moeda</label>
          <input
            value={draft.currency || ""}
            onChange={(e) => setField("currency", e.target.value.toUpperCase())}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Lead time do alerta</label>
          <input
            type="number"
            min="1"
            step="1"
            value={draft.alertLeadDays ?? 30}
            onChange={(e) => setField("alertLeadDays", e.target.value === "" ? 30 : Number(e.target.value))}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Compra</label>
          <input
            type="date"
            value={draft.purchaseDate || ""}
            onChange={(e) => setField("purchaseDate", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Início</label>
          <input
            type="date"
            value={draft.startDate || ""}
            onChange={(e) => setField("startDate", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Renovação</label>
          <input
            type="date"
            value={draft.renewalDate || ""}
            onChange={(e) => setField("renewalDate", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Expiração</label>
          <input
            type="date"
            value={draft.expiresAt || ""}
            onChange={(e) => setField("expiresAt", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Status manual</label>
          <select
            value={draft.status || ""}
            onChange={(e) => setField("status", e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          >
            <option value="">Automático</option>
            {microsoftAgreementStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-8">
          <input
            id="autoRenew"
            type="checkbox"
            checked={!!draft.autoRenew}
            onChange={(e) => setField("autoRenew", e.target.checked)}
          />
          <label htmlFor="autoRenew" className="text-sm">
            Renovação automática
          </label>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm mb-1">Observações</label>
        <textarea
          value={draft.notes || ""}
          onChange={(e) => setField("notes", e.target.value)}
          rows={4}
          className="w-full border border-border rounded px-3 py-2"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !draft.companyId || !draft.category || !draft.productName}
          className="px-4 py-2 bg-primary text-white rounded"
        >
          {saving ? "Salvando..." : submitLabel || (mode === "create" ? "Criar acordo" : "Salvar alterações")}
        </button>
        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white rounded"
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        )}
      </div>
    </div>
  );
}
