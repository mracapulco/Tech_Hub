"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";
import AgreementForm from "../_agreement-form";
import { Company, emptyAgreementDraft } from "../_lib";

export default function MicrosoftAgreementNewPage() {
  const token = typeof window !== "undefined" ? getToken() : null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [defaultCompanyId, setDefaultCompanyId] = useState("");

  useEffect(() => {
    (async () => {
      if (!token) return;
      const res = await apiGet<{ ok: boolean; data?: any[] }>("/companies", token);
      const nextCompanies = res?.ok ? (res.data || []).map((item: any) => ({ id: item.id, name: item.name })) : [];
      setCompanies(nextCompanies);
      if (nextCompanies.length === 1) setDefaultCompanyId(nextCompanies[0].id);
    })();
  }, [token]);

  async function handleSubmit(body: any) {
    if (!token) return;
    const res = await apiPost<{ ok: boolean; data?: { id: string }; error?: string }>("/licensing/microsoft/agreements", token, body);
    if (!res?.ok || !res.data?.id) {
      setStatusMessage({ type: "error", text: res?.error || "Falha ao criar acordo." });
      return;
    }
    setStatusMessage({ type: "success", text: "Acordo criado com sucesso." });
    window.location.href = `/licenciamento/microsoft/${res.data.id}`;
  }

  if (!token) {
    return <div className="p-4 text-sm text-muted">Faça login para continuar.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Novo acordo manual</h1>
          <p className="text-sm text-muted">Use este cadastro apenas para licenciamento que não venha de uma integração.</p>
        </div>
        <a href="/licenciamento/microsoft" className="px-3 py-2 rounded bg-border text-text">
          Voltar
        </a>
      </div>

      <AgreementForm
        token={token}
        companies={companies}
        initialValue={emptyAgreementDraft(defaultCompanyId)}
        mode="create"
        statusMessage={statusMessage}
        submitLabel="Criar acordo manual"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
