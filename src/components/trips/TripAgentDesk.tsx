"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

type ChatLine = { role: "agent" | "you"; text: string };

export function TripAgentDesk({
  city,
  days,
  startDate,
  endDate,
  suggestions,
  onCityInput,
  onPickSuggestion,
  onDays,
  onStartDate,
  travelers,
  onTravelers,
  intensity,
  onIntensity,
  transport,
  onTransport,
  party,
  hotel,
  flights,
  destination,
  cities,
  interests,
  idealTrip,
  onExchange,
  canGenerate,
  loading,
  progress,
  error,
  onGenerate,
}: {
  city: string;
  days: number;
  startDate: string;
  endDate: string;
  suggestions: { key: string; label: string }[];
  onCityInput: (value: string) => void;
  onPickSuggestion: (index: number) => void;
  onDays: (days: number) => void;
  onStartDate: (value: string) => void;
  travelers: number;
  onTravelers: (count: number) => void;
  intensity: "relaxed" | "balanced" | "packed";
  onIntensity: (value: "relaxed" | "balanced" | "packed") => void;
  transport: string;
  onTransport: (value: string) => void;
  party: string;
  hotel: ReactNode;
  flights: ReactNode;
  destination: string;
  cities: string[];
  interests: string[];
  idealTrip: string;
  onExchange: (userText: string, reply: string) => void;
  canGenerate: boolean | null;
  loading: boolean;
  progress: string;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl" data-tour="tour-create-wizard">
      <div className="mb-6 max-w-xl">
        <h1 className="text-[32px] font-bold tracking-tight text-[#080B3A]">
          Plan a trip
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Tell the agent where you are going.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_340px]">
        <section className="rounded-[20px] border border-[#E1E5F0] bg-white p-4 shadow-[0_8px_24px_rgba(8,11,58,0.05)] sm:p-6">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.6fr]">
            <div className="relative">
              <Label className="text-xs uppercase tracking-wide text-[#6B7280]">Where</Label>
              <Input
                value={city}
                onChange={(e) => onCityInput(e.target.value)}
                placeholder="Paris"
                autoComplete="off"
              />
              {suggestions.length ? (
                <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-[12px] border border-[#E1E5F0] bg-white shadow-lg">
                  {suggestions.map((item, index) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[#DDE1FF]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickSuggestion(index)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-[#6B7280]">Start</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => onStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-[#6B7280]">Days</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => onDays(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <AgentThread
            destination={destination}
            cities={cities}
            startDate={startDate}
            travelers={travelers}
            interests={interests}
            idealTrip={idealTrip}
            onExchange={onExchange}
          />
        </section>
        <aside className="flex max-h-[calc(100vh-7rem)] flex-col rounded-[20px] border border-[#E1E5F0] bg-white p-5 shadow-[0_8px_24px_rgba(8,11,58,0.05)] lg:sticky lg:top-6">
          <div className="min-h-0 flex-1 space-y-5 overflow-auto pr-1">
            <h2 className="text-[18px] font-semibold text-[#080B3A]">Trip brief</h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              Fills in as you talk.
            </p>
          <dl className="space-y-2.5 text-sm">
            <BriefRow label="Cities" value={cities.filter(Boolean).join(" → ")} />
            <BriefRow
              label="Dates"
              value={startDate ? `${startDate}${endDate ? ` – ${endDate}` : ""}` : ""}
            />
            <BriefRow label="Who" value={party} />
          </dl>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Pace
            </p>
            <div className="mt-2 flex gap-1 rounded-full bg-[#F5F7FF] p-1">
              {(["relaxed", "balanced", "packed"] as const).map((pace) => (
                <button
                  key={pace}
                  type="button"
                  className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold capitalize ${
                    intensity === pace ? "bg-[#0400FF] text-white" : "text-[#0400FF]"
                  }`}
                  onClick={() => onIntensity(pace)}
                >
                  {pace}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#6B7280]">Travelers</span>
            <input
              type="number"
              min={1}
              aria-label="Travelers"
              value={travelers}
              onChange={(e) => onTravelers(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded-[10px] border border-[#D1D7E5] px-2 py-1 text-center text-sm text-[#080B3A]"
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Getting around
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["walking", "Walking"],
                  ["transit", "Transit"],
                  ["driving", "Driving"],
                  ["cycling", "Cycling"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    transport === value
                      ? "bg-[#080B3A] text-white"
                      : "bg-[#F5F7FF] text-[#080B3A]"
                  }`}
                  onClick={() => onTransport(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {hotel}
          {flights}
          </div>
          <div className="shrink-0 space-y-2 border-t border-[#F0F2F8] bg-white pt-4">
            <p className="text-xs leading-relaxed text-[#6B7280]">
              {canGenerate === null
                ? "Checking whether generation is included."
                : canGenerate
                  ? "Generation is included on this account."
                  : "Generation is Pro at $6.99 a month. Subscribe from Plans."}
            </p>
            {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
            {progress ? <p className="text-sm text-[#0400FF]">{progress}</p> : null}
            <Button
              type="button"
              className="w-full"
              onClick={onGenerate}
              disabled={loading || !city.trim() || !startDate}
            >
              {loading ? "Working…" : "Generate itinerary"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[#6B7280]">{label}</dt>
      <dd className="line-clamp-2 text-right font-medium text-[#080B3A]">{value}</dd>
    </div>
  );
}

function AgentThread({
  destination,
  cities,
  startDate,
  travelers,
  interests,
  idealTrip,
  onExchange,
}: {
  destination: string;
  cities: string[];
  startDate: string;
  travelers: number;
  interests: string[];
  idealTrip: string;
  onExchange: (userText: string, reply: string) => void;
}) {
  const [log, setLog] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const onExchangeRef = useRef(onExchange);
  onExchangeRef.current = onExchange;
  const userSpoke = useRef(false);
  const payload = useRef({ destination, cities, startDate, travelers, interests, idealTrip });
  payload.current = { destination, cities, startDate, travelers, interests, idealTrip };

  async function talk(history: { role: "user" | "assistant"; text: string }[], message: string) {
    const res = await fetch("/api/trips/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload.current,
        history,
        message,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not continue");
    return (data.reply as string) || "Tell me a little more about how you want the days to feel.";
  }

  useEffect(() => {
    if (userSpoke.current) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setStatus("loading");
      void talk([], "")
        .then((reply) => {
          if (cancelled || userSpoke.current) return;
          setLog([{ role: "agent", text: reply }]);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, destination.trim() ? 400 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // Re-greet only before the traveler has spoken, so naming the city updates the opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  async function send() {
    const said = draft.trim();
    if (!said || status === "loading") return;
    userSpoke.current = true;
    const asked = [...log].reverse().find((line) => line.role === "agent")?.text ?? "";
    const history = log.map((line) => ({
      role: line.role === "you" ? ("user" as const) : ("assistant" as const),
      text: line.text,
    }));
    setLog((prev) => [...prev, { role: "you", text: said }]);
    setDraft("");
    setStatus("loading");
    try {
      const reply = await talk(history, said);
      onExchangeRef.current(said, asked);
      setLog((prev) => [...prev, { role: "agent", text: reply }]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-6 flex min-h-[420px] flex-col">
      <div className="flex-1 space-y-3">
        {log.map((line, index) => (
          <p
            key={`${line.role}-${index}`}
            className={`max-w-[85%] rounded-[18px] px-4 py-3 text-sm leading-relaxed ${
              line.role === "agent"
                ? "bg-[#F5F7FF] text-[#1F2937]"
                : "ml-auto bg-[#080B3A] text-white"
            }`}
          >
            {line.text}
          </p>
        ))}
        {status === "loading" ? (
          <p className="text-sm text-[#0400FF]">Thinking about the trip…</p>
        ) : null}
        {status === "error" ? (
          <p className="text-sm text-[#DC2626]">
            That reply did not come through. You can try again.
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex items-end gap-2 rounded-[16px] border border-[#D1D7E5] bg-[#F5F7FF] p-2">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Who's coming, or ask for a few day ideas"
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#080B3A] outline-none placeholder:text-[#9299B5]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void send()}
          disabled={!draft.trim() || status === "loading"}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
