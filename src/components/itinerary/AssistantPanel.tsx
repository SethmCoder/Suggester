"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AssistantPatch } from "@/lib/ai/patch";

export function AssistantPanel({
  tripId,
  isDemo = false,
}: {
  tripId: string;
  isDemo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<AssistantPatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    try {
      if (isDemo) {
        setPending({
          summary:
            "Demo response: in a real trip I would propose targeted schedule changes. Sign up to use the live assistant.",
          operations: [],
        });
        return;
      }
      const res = await fetch(`/api/trips/${tripId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPending(data.patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!pending) return;
    await fetch(`/api/trips/${tripId}/assistant/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    setPending(null);
    setMessage("");
    window.location.reload();
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(100%,22rem)]">
      {open ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Itinerary assistant</p>
            <button type="button" onClick={() => setOpen(false)} className="text-[#6B7280]">
              ✕
            </button>
          </div>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm"
            placeholder="e.g. Make Wednesday less busy"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {error ? <p className="mt-1 text-xs text-[#DC2626]">{error}</p> : null}
          {pending ? (
            <div className="mt-3 rounded-lg bg-[#EEEEFF] p-3 text-sm">
              <p className="font-medium">Proposed changes</p>
              <p className="mt-1 text-[#6B7280]">{pending.summary}</p>
              <pre className="mt-2 max-h-32 overflow-auto text-xs">
                {JSON.stringify(pending.operations, null, 2)}
              </pre>
              <div className="mt-3 flex gap-2">
                <Button type="button" onClick={apply}>
                  Apply
                </Button>
                <Button type="button" variant="secondary" onClick={() => setPending(null)}>
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              className="mt-2 w-full"
              disabled={loading || !message.trim()}
              onClick={send}
            >
              {loading ? "Thinking…" : "Suggest changes"}
            </Button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-[#1616C9] px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-[#1010A3]"
        >
          Assistant
        </button>
      )}
    </div>
  );
}
