"use client";

import { useEffect, useMemo, useState } from "react";

type Option = { key: string; label: string; weight: number };
type Question = { key: string; text: string; options: Option[] };
type Category = { key: string; name: string; questions: Question[] };
type Questionnaire = { version: string; title: string; categories: Category[] };

export default function NovaAvaliacaoPage() {
  const [data, setData] = useState<Questionnaire | null>(null);
  const [step, setStep] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/cyber-questionnaire.json")
      .then((r) => r.json())
      .then((json: Questionnaire) => setData(json))
      .catch(() => setError("Falha ao carregar questionário."))
      .finally(() => setLoading(false));
  }, []);

  const currentCategory = useMemo(() => {
    if (!data) return null;
    return data.categories[step] ?? null;
  }, [data, step]);

  const totalSteps = data?.categories.length ?? 0;

  function onSelect(questionKey: string, optionKey: string) {
    setAnswers((prev) => ({ ...prev, [questionKey]: optionKey }));
  }

  function prevStep() {
    setStep((s) => Math.max(0, s - 1));
  }
  function nextStep() {
    setStep((s) => Math.min((data?.categories.length ?? 1) - 1, s + 1));
  }

  const result = useMemo(() => {
    if (!data) return null;
    const catResults = data.categories.map((cat) => {
      const catMax = cat.questions.reduce((acc, q) => acc + Math.max(...q.options.map((o) => o.weight)), 0);
      const catScore = cat.questions.reduce((acc, q) => {
        const sel = answers[q.key];
        const opt = q.options.find((o) => o.key === sel);
        return acc + (opt?.weight ?? 0);
      }, 0);
      const pct = catMax > 0 ? Math.round((catScore / catMax) * 100) : 0;
      return { key: cat.key, name: cat.name, score: catScore, max: catMax, pct };
    });
    const totalMax = catResults.reduce((a, c) => a + c.max, 0);
    const totalScore = catResults.reduce((a, c) => a + c.score, 0);
    const totalPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    return { categories: catResults, total: { score: totalScore, max: totalMax, pct: totalPct } };
  }, [data, answers]);

  if (loading) return <div className="p-4">Carregando questionário...</div>;
  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!data) return <div className="p-4">Questionário indisponível.</div>;

  return (
    <main className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{data.title}</h2>
        <span className="text-sm text-gray-500">Versão {data.version}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="font-medium">Etapa:</span>
        <span>
          {step + 1} / {totalSteps}
        </span>
      </div>

      {currentCategory && (
        <section className="mt-6">
          <h3 className="text-lg font-semibold">{currentCategory.name}</h3>
          <div className="mt-3 space-y-4">
            {currentCategory.questions.map((q) => (
              <div key={q.key} className="p-3 border rounded">
                <div className="font-medium">{q.text}</div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {q.options.map((opt) => (
                    <label key={opt.key} className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={q.key}
                        value={opt.key}
                        checked={answers[q.key] === opt.key}
                        onChange={() => onSelect(q.key, opt.key)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              className="px-3 py-2 rounded border hover:bg-gray-50"
              onClick={prevStep}
              disabled={step === 0}
            >
              Anterior
            </button>
            {step < totalSteps - 1 ? (
              <button className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={nextStep}>
                Próximo
              </button>
            ) : (
              <button className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700" onClick={() => {}}>
                Concluir
              </button>
            )}
          </div>
        </section>
      )}

      {result && (
        <section className="mt-8">
          <h3 className="text-lg font-semibold">Resumo</h3>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            {result.categories.map((c) => (
              <div key={c.key} className="p-3 border rounded">
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-gray-600">{c.score} / {c.max} ({c.pct}%)</div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded bg-gray-50">
            <div className="text-lg font-semibold">Score total: {result.total.pct}%</div>
            <div className="text-sm text-gray-600">{result.total.score} / {result.total.max}</div>
          </div>
        </section>
      )}
    </main>
  );
}