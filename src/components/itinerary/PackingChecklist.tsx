"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  normalizePacking,
  packingItemsFromLabels,
  seedPackingList,
  type PackingItem,
} from "@/lib/trips/packing";

export function PackingChecklist({
  items,
  onChange,
  party,
  durationDays,
  wetWeather,
  destination,
  interests,
}: {
  items: PackingItem[];
  onChange: (next: PackingItem[]) => void;
  party?: string | null;
  durationDays?: number | null;
  wetWeather?: boolean;
  destination?: string | null;
  interests?: string[];
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  const list = normalizePacking(items);
  const destLabel = (destination || "").replace(/\s*\(Demo\)\s*$/i, "").trim();

  function toggle(id: string) {
    onChange(
      list.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  function addCustom() {
    const label = draft.trim();
    if (!label) return;
    onChange([
      ...list,
      {
        id: `pack-${Date.now()}`,
        label,
        checked: false,
      },
    ]);
    setDraft("");
  }

  function reseeds() {
    setSampleNote(null);
    onChange(
      seedPackingList({
        party,
        durationDays,
        wetWeather,
      }),
    );
  }

  async function loadSampleList() {
    if (!destLabel || busy) return;
    setBusy(true);
    setSampleNote(null);
    try {
      const res = await fetch("/api/trips/sample-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "packing",
          destination: destLabel,
          durationDays: durationDays ?? undefined,
          party: party ?? undefined,
          wetWeather: Boolean(wetWeather),
          interests: interests?.slice(0, 8),
        }),
      });
      const data = (await res.json()) as {
        items?: string[];
        title?: string;
        note?: string;
        source?: string;
        error?: string;
      };
      if (!res.ok || !data.items?.length) {
        setSampleNote(data.error ?? "Could not build a sample list.");
        return;
      }
      onChange(packingItemsFromLabels(data.items));
      setSampleNote(
        [
          data.title,
          data.source === "ai" ? "AI sample" : "Catalog sample",
          data.note,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch {
      setSampleNote("Could not build a sample list.");
    } finally {
      setBusy(false);
    }
  }

  const done = list.filter((i) => i.checked).length;

  return (
    <section
      id="packing"
      className="scroll-mt-24 rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_16px_rgba(8,11,58,0.04)] sm:p-6"
    >
      <div id="notes" className="scroll-mt-24" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-[#080B3A]">
            Packing list
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
            {list.length
              ? `${done} of ${list.length} packed`
              : "Seed essentials or generate a sample for this destination"}
            {wetWeather ? " · Rain gear included" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {destLabel ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadSampleList()}
              className="text-xs font-semibold text-[#0400FF] hover:underline disabled:opacity-50"
            >
              {busy
                ? "Building sample…"
                : `Sample list for ${destLabel.split(/→|,/)[0]?.trim() || destLabel}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={reseeds}
            className="text-xs font-semibold text-[#6B7280] hover:underline"
          >
            {list.length ? "Basic reseed" : "Seed list"}
          </button>
        </div>
      </div>
      {sampleNote ? (
        <p className="mt-2 text-[11px] leading-relaxed text-[#9299B5]">
          {sampleNote}
        </p>
      ) : null}
      {list.length ? (
        <ul className="mt-4 space-y-0.5">
          {list.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 hover:bg-[#F5F7FF]">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggle(item.id)}
                  className="accent-[#0400FF]"
                />
                <span
                  className={`text-sm ${
                    item.checked
                      ? "text-[#9CA3AF] line-through"
                      : "text-[#080B3A]"
                  }`}
                >
                  {item.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={addCustom}>
          Add
        </Button>
      </div>
    </section>
  );
}
