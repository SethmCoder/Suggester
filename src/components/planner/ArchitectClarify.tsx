"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceList } from "@/components/chat/ChoiceList";

type ChatLine = { role: "user" | "assistant"; text: string };
type ClarifyChoice = { id: string; label: string };

/**
 * Short conversational clarify loop for Trip Architect.
 * Reuses /api/trips/clarify — does not mount the full CreateTripWizard desk.
 */
export function ArchitectClarify({
  idea,
  cities,
  interests,
  travelers,
  intensity,
  onDone,
}: {
  idea: string;
  cities: string[];
  interests: string[];
  travelers: number;
  intensity: string;
  onDone: (patch: {
    interests?: string[];
    travelers?: number;
    intensity?: string;
    budget?: number | null;
  }) => void;
}) {
  const [history, setHistory] = useState<ChatLine[]>([
    {
      role: "assistant",
      text: "Quick check before we pick destinations — anything important about pace, budget, or who is going?",
    },
  ]);
  const [choices, setChoices] = useState<ClarifyChoice[]>([
    { id: "skip", label: "Skip — keep going" },
    { id: "relaxed", label: "Keep the pace relaxed" },
    { id: "packed", label: "Make days fuller" },
    { id: "budget", label: "I have a budget in mind" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState(0);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    if (/^skip/i.test(trimmed) || trimmed === "Skip — keep going") {
      onDone({});
      return;
    }

    const nextHistory: ChatLine[] = [
      ...history,
      { role: "user", text: trimmed },
    ];
    setHistory(nextHistory);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/trips/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: cities[0] || "",
          cities,
          travelers,
          interests,
          intensity,
          idealTrip: idea,
          history: nextHistory.slice(-12),
          message: trimmed,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        choices?: ClarifyChoice[];
        error?: string;
      };
      const reply =
        data.reply ||
        data.error ||
        "Got it — we can refine this later in the planner.";
      setHistory((h) => [...h, { role: "assistant", text: reply }]);
      setChoices(data.choices?.length ? data.choices : []);
      const nextTurns = turns + 1;
      setTurns(nextTurns);

      const patch: {
        interests?: string[];
        intensity?: string;
        budget?: number | null;
      } = {};
      if (/relax/i.test(trimmed)) patch.intensity = "relaxed";
      if (/fuller|packed|busy/i.test(trimmed)) patch.intensity = "packed";
      const money = trimmed.match(/\$?\s?([\d,]+)/);
      if (money && /budget|spend|\$|usd/i.test(trimmed)) {
        patch.budget = Number(money[1].replace(/,/g, ""));
      }
      if (nextTurns >= 2) {
        onDone(patch);
      } else if (Object.keys(patch).length) {
        onDone(patch);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
        Quick questions
      </p>
      <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
        {history.map((line, i) => (
          <p
            key={`${line.role}-${i}`}
            className={
              line.role === "assistant"
                ? "text-[#374151]"
                : "font-medium text-[#080B3A]"
            }
          >
            {line.text}
          </p>
        ))}
      </div>
      <ChoiceList
        choices={choices}
        disabled={busy}
        onPick={(label) => void send(label)}
        onOther={() => setInput("")}
      />
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send(input);
          }}
          placeholder="Type a short answer…"
          className="h-10 flex-1 rounded-[10px] border border-[#D1D7E5] px-3 text-sm"
        />
        <Button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => void send(input)}
        >
          Send
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => onDone({})}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
