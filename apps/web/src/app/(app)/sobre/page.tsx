import Image from 'next/image';
import { readFileSync } from 'fs';
import path from 'path';
import pkg from '../../../../package.json';

type ChangelogSection = {
  title: string;
  items: string[];
};

function getCurrentChangelog(version: string) {
  try {
    const filePath = path.join(process.cwd(), 'public', 'changelog-current.md');
    const content = readFileSync(filePath, 'utf8');
    const headerMatch = content.match(/##\s+\[(.+?)\]\s+-\s+(.+)/);
    const releaseVersion = headerMatch?.[1] || version;
    const releaseDate = headerMatch?.[2] || 'Data nao informada';
    const sections: ChangelogSection[] = [];
    const matches = [...content.matchAll(/###\s+(.+)\n([\s\S]*?)(?=\n###\s+|$)/g)];

    for (const match of matches) {
      const title = match[1]?.trim() || 'Atualizacoes';
      const body = match[2] || '';
      const items = body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim());

      if (items.length > 0) {
        sections.push({ title, items });
      }
    }

    return { releaseVersion, releaseDate, sections };
  } catch {
    return {
      releaseVersion: version,
      releaseDate: 'Data nao informada',
      sections: [
        {
          title: 'Changelog',
          items: ['As notas da versao atual ainda nao foram publicadas nesta instalacao.'],
        },
      ],
    };
  }
}

export default function SobrePage() {
  const version = pkg?.version ?? '0.0.0';
  const changelog = getCurrentChangelog(version);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-border bg-card p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <Image src="/logo.svg" alt="Tech Hub" width={160} height={44} priority />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Sobre o Tech Hub</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                O Tech Hub e uma plataforma de gestao e analise tecnica criada para centralizar
                operacoes, relatorios e visoes executivas de diferentes frentes do ambiente de TI.
                O objetivo e reunir dados operacionais em uma experiencia unica, com foco em
                produtividade, padronizacao e acompanhamento continuo.
              </p>
            </div>
          </div>
          <div className="grid min-w-[260px] grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted">Plataforma</div>
              <div className="mt-1 text-base font-semibold">Tech Hub</div>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted">Versao atual</div>
              <div className="mt-1 text-base font-semibold">{version}</div>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-muted">Release em exibicao</div>
              <div className="mt-1 text-sm font-medium">
                {changelog.releaseVersion} | {changelog.releaseDate}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Changelog da Versao Atual</h2>
            <p className="mt-1 text-sm text-muted">
              Notas de atualizacao referentes a versao instalada no ambiente.
            </p>
          </div>
          <div className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted">
            v{changelog.releaseVersion}
          </div>
        </div>

        <div className="space-y-4">
          {changelog.sections.map((section) => (
            <div key={section.title} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{section.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[2px] text-primary">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
