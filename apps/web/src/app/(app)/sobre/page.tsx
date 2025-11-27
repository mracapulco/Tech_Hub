"use client";
import React from 'react';
import pkg from '../../../../package.json';

export default function SobrePage() {
  const version = pkg?.version ?? '0.0.0';
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Sobre o Tech Hub</h1>
      <p className="text-sm text-muted mb-4">Informações do aplicativo e versão atual.</p>
      <div className="rounded border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Nome</span>
          <span className="text-sm font-medium">Tech Hub</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Versão</span>
          <span className="text-sm font-medium">{version}</span>
        </div>
        <div className="pt-2 text-sm text-gray-600">
          <p>
            O Tech Hub é uma plataforma para gestão e análise técnica. Esta página resume
            informações básicas e a versão instalada. Para detalhes de mudanças, consulte o
            CHANGELOG no repositório.
          </p>
        </div>
      </div>
    </div>
  );
}