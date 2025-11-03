"use client";
import React from "react";

type Item = { id: string; name: string };

export default function DualListSelector({
  available,
  selectedIds,
  onChange,
  leftTitle = "Disponíveis",
  rightTitle = "Selecionados",
  disabled = false,
}: {
  available: Item[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  leftTitle?: string;
  rightTitle?: string;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selectedIds);
  const leftItems = available.filter((i) => !selectedSet.has(i.id));
  const rightItems = available.filter((i) => selectedSet.has(i.id));

  const [leftSel, setLeftSel] = React.useState<string[]>([]);
  const [rightSel, setRightSel] = React.useState<string[]>([]);

  function addSelected() {
    if (disabled) return;
    const next = Array.from(new Set([...selectedIds, ...leftSel]));
    onChange(next);
    setLeftSel([]);
  }

  function removeSelected() {
    if (disabled) return;
    const remove = new Set(rightSel);
    const next = selectedIds.filter((id) => !remove.has(id));
    onChange(next);
    setRightSel([]);
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <label className="text-xs text-muted mb-1 block">{leftTitle}</label>
        <select
          multiple
          disabled={disabled}
          value={leftSel}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
            setLeftSel(vals);
          }}
          className="border border-border rounded px-2 py-1 text-sm w-full h-40"
        >
          {leftItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col items-center gap-2 pt-6">
        <button type="button" onClick={addSelected} disabled={disabled || leftSel.length === 0} className="px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">Adicionar →</button>
        <button type="button" onClick={removeSelected} disabled={disabled || rightSel.length === 0} className="px-2 py-1 rounded bg-muted text-foreground hover:opacity-80 disabled:opacity-50">← Remover</button>
      </div>
      <div className="flex-1">
        <label className="text-xs text-muted mb-1 block">{rightTitle}</label>
        <select
          multiple
          disabled={disabled}
          value={rightSel}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
            setRightSel(vals);
          }}
          className="border border-border rounded px-2 py-1 text-sm w-full h-40"
        >
          {rightItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}