"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { titleCase } from "@/lib/format";
import { MicrosoftAgreement, formatBillingPeriod, formatCurrency, formatDate, getUploadUrl, statusLabel, statusTone } from "../_lib";

export default function MicrosoftAgreementViewPage({ params }: { params: { id: string } }) {
  const token = typeof window !== "undefined" ? getToken() : null;
  const user = typeof window !== "undefined" ? getUser() : null;
  const [agreement, setAgreement] = useState<MicrosoftAgreement | null>(null);
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const res = await apiGet<{ ok: boolean; data?: MicrosoftAgreement; error?: string }>(`/licensing/microsoft/agreements/${params.id}`, token);
      if (res?.ok && res.data) setAgreement(res.data);
      if (user?.id) {
        try {
          const userRes = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (userRes?.data?.memberships || []) as { role: string }[];
          const isGlobalAdmin = !!userRes?.data?.isGlobalAdmin;
          setIsAdminOrTech(isGlobalAdmin || memberships.some((item) => item.role === "ADMIN" || item.role === "TECHNICIAN"));
        } catch {}
      }
    })();
  }, [token, user?.id, params.id]);

  if (!token) {
    return <div className="p-4 text-sm text-muted">Faça login para continuar.</div>;
  }

  if (!agreement) {
    return <div className="p-4 text-sm text-muted">Carregando assinatura...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{agreement.productName}</h1>
          <p className="text-sm text-muted">
            {agreement.companyName || "Não mapeado"} · {statusLabel(agreement.sourceProvider || "MANUAL")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/licenciamento/microsoft" className="px-3 py-2 rounded bg-border text-text">
            Voltar
          </a>
          {isAdminOrTech && !agreement.isReadOnly && (
            <a href={`/licenciamento/microsoft/${agreement.id}/editar`} className="px-3 py-2 rounded bg-primary text-white">
              Editar
            </a>
          )}
          <button onClick={() => window.print()} className="px-3 py-2 rounded bg-border text-text">
            Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard label="Status" value={statusLabel(agreement.providerStatus || agreement.status)} tone={statusTone(agreement.providerStatus || agreement.status)} />
        <SummaryCard label="Tipo" value={agreement.isRecurring ? "Recorrente" : "Não recorrente"} />
        <SummaryCard label="Quantidade" value={String(agreement.quantityPurchased ?? "—")} helper="Licenças" />
        <SummaryCard label="Valor da cobrança" value={formatCurrency(agreement.billingAmount ?? agreement.totalPrice, agreement.currency)} helper={formatBillingPeriod(agreement.billingModel)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Detalhe da assinatura</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Empresa Tech Hub" value={agreement.companyName || "—"} />
            <Field label="Cliente externo" value={titleCase(agreement.externalCustomerName) || "—"} />
            <Field label="Fornecedor" value={statusLabel(agreement.sourceProvider || "MANUAL")} />
            <Field label="Nome do produto" value={agreement.productName} />
            <Field label="Subscription ID" value={agreement.externalSubscriptionId || "—"} />
            <Field label="Vendor Subscription ID" value={agreement.vendorSubscriptionId || "—"} />
            <Field label="Product ID" value={agreement.productId || "—"} />
            <Field label="MPN" value={agreement.mpn || agreement.sku || "—"} />
            <Field label="Tenant/domain Microsoft" value={agreement.microsoftDomain || agreement.tenantDomain || "—"} />
            <Field label="Microsoft customer ID" value={agreement.microsoftCustomerId || "—"} />
            <Field label="Microsoft tenant ID" value={agreement.microsoftTenantId || "—"} />
            <Field label="Quantidade" value={String(agreement.quantityPurchased ?? "—")} />
            <Field label="Status" value={statusLabel(agreement.providerStatus || agreement.status)} />
            <Field label="Tipo" value={agreement.isRecurring ? "Recorrente" : "Não recorrente"} />
            <Field label="Cobrança" value={formatBillingPeriod(agreement.billingModel)} />
            <Field label="Compromisso" value={formatBillingPeriod(agreement.subscriptionPeriod)} />
            <Field label="Data de criação" value={formatDate(agreement.startDate || agreement.createdAt)} />
            <Field label="Renewal Date" value={agreement.isRecurring ? formatDate(agreement.renewalDate) : "Não recorrente"} />
            <Field label="Expiration Date" value={formatDate(agreement.expiresAt)} />
            <Field label="Preço unitário" value={formatCurrency(agreement.unitPrice, agreement.currency)} />
            <Field label="Custo unitário" value={formatCurrency(agreement.unitCost, agreement.currency)} />
            <Field label="Valor da cobrança" value={formatCurrency(agreement.billingAmount ?? agreement.totalPrice, agreement.currency)} />
            <Field label="Custo da cobrança" value={formatCurrency(agreement.billingCost, agreement.currency)} />
            <Field label="Margem" value={formatCurrency(agreement.margin, agreement.currency)} />
            <Field label="Margem %" value={agreement.marginPercent != null ? `${agreement.marginPercent.toFixed(2)}%` : "—"} />
          </div>
        </div>

        <div className="bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Documentos</h2>
          <div className="space-y-3">
            {agreement.documents.map((doc) => (
              <div key={doc.id} className="border border-border rounded p-3">
                <div className="font-medium">{doc.title}</div>
                <div className="text-xs text-muted">
                  {statusLabel(doc.documentType)} · {formatDate(doc.issuedAt)}
                </div>
                <div className="text-xs text-muted">
                  {doc.documentNumber || "—"} {doc.amount != null ? `· ${formatCurrency(doc.amount, doc.currency)}` : ""}
                </div>
                {doc.fileUrl && (
                  <a href={getUploadUrl(doc.fileUrl)} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                    Abrir anexo
                  </a>
                )}
              </div>
            ))}
            {agreement.documents.length === 0 && <div className="text-sm text-muted">Nenhum documento associado.</div>}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <h2 className="font-semibold mb-3">Fontes do registro</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-2">Fornecedor</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Cliente externo</th>
                <th className="py-2">Registro</th>
                <th className="py-2">Observado em</th>
              </tr>
            </thead>
            <tbody>
              {agreement.sources.map((source) => (
                <tr key={source.id} className="border-b border-border">
                  <td className="py-3">{statusLabel(source.provider)}</td>
                  <td className="py-3">{statusLabel(source.sourceType)}</td>
                  <td className="py-3">
                    <div>{titleCase(source.externalCustomerName) || "—"}</div>
                    <div className="text-xs text-muted">{source.externalCustomerId || "—"}</div>
                  </td>
                  <td className="py-3">
                    <div>{source.externalReference || "—"}</div>
                    <div className="text-xs text-muted">{source.externalRecordId || "—"}</div>
                  </td>
                  <td className="py-3">{formatDate(source.observedAt)}</td>
                </tr>
              ))}
              {agreement.sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted">
                    Nenhuma fonte registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${tone || ""}`}>{value}</div>
      {helper && <div className="text-xs text-muted mt-1">{helper}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div>{value}</div>
    </div>
  );
}
