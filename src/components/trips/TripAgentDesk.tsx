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
      <div className="mb-5">
        <h1 className="text-[28px] font-bold tracking-tight text-[#080B3A]">
          Plan a trip
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Tell the agent where you are going.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <section className="rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_6px_18px_rgba(8,11,58,0.05)] sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-1">
              <Label>Where</Label>
              <Input
                value={city}
                onChange={(e) => onCityInput(e.target.value)}
                className="mt-1"
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
              <Label>Start</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => onStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Days</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => onDays(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1"
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
        <aside className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-5 shadow-[0_6px_18px_rgba(8,11,58,0.05)]">
          <div>
            <h2 className="text-[16px] font-semibold text-[#080B3A]">Trip brief</h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              This is what the itinerary will be built from.
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <BriefRow label="Cities" value={cities.filter(Boolean).join(" → ")} />
            <BriefRow label="Dates" value={startDate ? `${startDate}${endDate ? ` – ${endDate}` : ""}` : ""} />
            <BriefRow label="Who" value={party || (travelers ? `${travelers} travelers` : "")} />
            <BriefRow label="Pace" value={intensity} />
            <BriefRow label="Getting around" value={transport} />
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {(["relaxed", "balanced", "packed"] as const).map((pace) => (
              <button
                key={pace}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  intensity === pace ? "bg-[#0400FF] text-white" : "bg-[#F5F7FF] text-[#0400FF]"
                }`}
                onClick={() => onIntensity(pace)}
              >
                {pace}
              </button>
            ))}
          </div>
          <label className="block text-xs text-[#6B7280]">
            Travelers
            <input
              type="number"
              min={1}
              value={travelers}
              onChange={(e) => onTravelers(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-20 rounded-[8px] border border-[#D1D7E5] px-2 py-1 text-sm text-[#080B3A]"
            />
          </label>
          <label className="block text-xs text-[#6B7280]">
            Within the city
            <select
              value={transport}
              onChange={(e) => onTransport(e.target.value)}
              className="mt-1 w-full rounded-[8px] border border-[#D1D7E5] bg-white px-2 py-1.5 text-sm text-[#080B3A]"
            >
              <option value="walking">Walking</option>
              <option value="transit">Public transit</option>
              <option value="driving">Driving</option>
              <option value="cycling">Cycling</option>
            </select>
          </label>
          {hotel}
          {flights}
          <p className="rounded-[12px] bg-[#F5F7FF] px-3 py-2 text-xs leading-relaxed text-[#1F2937]">
            {canGenerate === null
              ? "Checking whether a generated itinerary is included."
              : canGenerate
                ? "A full generated itinerary is included on this account. This conversation does not use that."
                : "A full generated itinerary is part of Pro at $6.99 a month. Checkout is not taking cards yet, so Generate will not turn Pro on. This conversation is included either way."}
          </p>
          {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
          {progress ? <p className="text-sm text-[#0400FF]">{progress}</p> : null}
          <Button type="button" className="w-full" onClick={onGenerate} disabled={loading || !city.trim() || !startDate}>
            {loading ? "Working…" : "Generate itinerary"}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F0F2F8] pb-2">
      <dt className="text-[#6B7280]">{label}</dt>
      <dd className="text-right font-medium capitalize text-[#080B3A]">{value}</dd>
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
    <div className="mt-5 space-y-3">
      <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
        {log.map((line, index) => (
          <p
            key={`${line.role}-${index}`}
            className={`max-w-[92%] rounded-[16px] px-3.5 py-2.5 text-sm leading-relaxed ${
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
      <div>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="I'm going with my sister and her kids. Or: can you give me examples?"
          className="w-full rounded-[12px] border border-[#D1D7E5] px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          className="mt-2"
          onClick={() => void send()}
          disabled={!draft.trim() || status === "loading"}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
