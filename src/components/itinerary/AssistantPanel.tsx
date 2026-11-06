"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconX } from "@/components/ui/Icons";
import type { AssistantPatch } from "@/lib/ai/patch";

export function AssistantPanel({
  tripId,
  isDemo = false,
  onDemoApply,
}: {
  tripId: string;
  isDemo?: boolean;
  onDemoApply?: (patch: AssistantPatch) => void;
}) {
  const [open, setOpen] = useState(false);

  // Open during the guided tour assistant step
  useEffect(() => {
    function syncTour() {
      try {
        if (localStorage.getItem("waypoint:tour-dismissed-v2") === "1") return;
        const step = Number(localStorage.getItem("waypoint:tour-step-v2") ?? "-1");
        // Step index 4 is the assistant stop in FirstRunTour
        if (step === 4) setOpen(true);
      } catch {
        /* ignore */
      }
    }
    syncTour();
    window.addEventListener("waypoint:tour-step", syncTour);
    window.addEventListener("storage", syncTour);
    return () => {
      window.removeEventListener("waypoint:tour-step", syncTour);
      window.removeEventListener("storage", syncTour);
    };
  }, []);
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState<{ role: "you" | "wizard"; text: string }[]>([]);
  const [pending, setPending] = useState<AssistantPatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text?: string) {
    const content = (text ?? message).trim();
    if (!content) return;
    setMessage(content);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const operations = data.patch?.operations ?? [];
      setPending(operations.length ? data.patch : null);
      setMessage("");
      setThread((prev) => [
        ...prev,
        { role: "you", text: content },
        { role: "wizard", text: data.patch?.summary ?? "I can talk through the plan." },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!pending) return;
    if (isDemo && onDemoApply) {
      onDemoApply(pending);
      setPending(null);
      setMessage("");
      return;
    }
    const res = await fetch(`/api/trips/${tripId}/assistant/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not apply");
      return;
    }
    setPending(null);
    setMessage("");
    window.location.reload();
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[min(100%-1.5rem,22rem)]"
      data-tour="tour-assistant"
    >
      {open ? (
        <div className="overflow-hidden rounded-[16px] border border-[#E1E5F0] bg-white shadow-[0_16px_48px_rgba(8,11,58,0.18)]">
          <div className="flex items-center justify-between bg-[#080B3A] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Trip Wizard</p>
              <p className="text-[11px] text-[#C5CAE5]">
                Your travel agent
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-[#C5CAE5] hover:bg-[#20276D] hover:text-white"
              aria-label="Close"
            >
              <IconX size={16} />
            </button>
          </div>
          <div className="p-4">
            {thread.length ? (
              <div className="mb-3 max-h-40 space-y-1 overflow-auto">
                {thread.map((line, index) => (
                  <p key={`${line.role}-${index}`} className="text-xs text-[#1F2937]">
                    <span className="font-semibold">
                      {line.role === "you" ? "You" : "Trip Wizard"}:
                    </span>{" "}
                    {line.text}
                  </p>
                ))}
              </div>
            ) : !pending && !message.trim() ? (
              <p className="mb-3 text-sm leading-relaxed text-[#1F2937]">
                Hello. I&apos;m Trip Wizard. Ask me about this trip, or tell me
                what you want changed.
              </p>
            ) : null}
            <textarea
              rows={3}
              className="w-full rounded-[12px] border border-[#D1D7E5] px-3 py-2 text-sm focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
              placeholder="Ask about a stop, or tell me what to change"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            {error ? (
              <p className="mt-1 text-xs text-[#DC2626]">{error}</p>
            ) : null}
            {pending ? (
              <div className="mt-3 rounded-[12px] border border-[#DDE1FF] bg-[#F5F7FF] p-3 text-sm">
                <p className="font-semibold text-[#080B3A]">Suggested changes</p>
                <p className="mt-1 text-[#6B7280]">{pending.summary}</p>
                {pending.operations.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-xs text-[#1F2937]">
                    {pending.operations.map((op, i) => (
                      <li key={i}>
                        <code className="text-[#0400FF]">{op.op}</code>
                        {"shiftMinutes" in op && op.shiftMinutes != null
                          ? ` · +${op.shiftMinutes} min`
                          : ""}
                        {"newName" in op && op.newName
                          ? ` → ${op.newName}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {pending.suggestions?.length ? (
                  <div className="mt-2 space-y-1">
                    {pending.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="block text-left text-xs font-medium text-[#0400FF] underline"
                        onClick={() => send(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    onClick={apply}
                    disabled={!pending.operations.length}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPending(null)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                className="mt-3 w-full"
                disabled={loading || !message.trim()}
                onClick={() => send()}
              >
                {loading ? "Reviewing your trip…" : "Ask Trip Wizard"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-[#0400FF] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#0400FF]/35 hover:bg-[#0A0080]"
        >
          Trip Wizard
        </button>
      )}
    </div>
  );
}
