"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";

type PasteResult = {
  booking?: unknown;
  planShift?: { shifted?: boolean; tripId?: string };
  error?: string;
  match?: { id: string; kind: string } | null;
};

export function PasteDropZone({
  preferredFutureTripId,
  onDone,
  compact,
}: {
  preferredFutureTripId: string;
  onDone?: (result: PasteResult) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = useCallback(
    async (payload: { text: string; html?: string }) => {
      if (!payload.text.trim() && !payload.html) {
        setMessage("Paste or drop a confirmation email first.");
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/dreamer/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: payload.text,
            html: payload.html,
            preferredFutureTripId,
          }),
        });
        const data = (await res.json()) as PasteResult & {
          error?: string;
          booking?: { id?: string };
        };
        if (!res.ok) throw new Error(data.error ?? "Paste failed");
        if (data.booking?.id?.startsWith("local-")) {
          sessionStorage.setItem(
            `waypoint:dreamer-email:${data.booking.id}`,
            payload.text || payload.html || "",
          );
        }
        setText("");
        setOpen(false);
        setMessage(
          data.planShift?.shifted
            ? "Booking saved — dream shifted to a plan."
            : "Booking saved.",
        );
        onDone?.(data);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Paste failed");
      } finally {
        setBusy(false);
      }
    },
    [onDone, preferredFutureTripId],
  );

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const raw = await file.text();
      await submit({ text: raw });
      return;
    }
    const html = e.dataTransfer.getData("text/html");
    const plain = e.dataTransfer.getData("text/plain");
    await submit({ text: plain || html, html: html || undefined });
  }

  return (
    <div
      className={`rounded-[12px] border border-dashed p-3 ${
        dragOver
          ? "border-[#0400FF] bg-[#F5F7FF]"
          : "border-[#D1D7E5] bg-[#FAFBFF]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void onDrop(e)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
        Paste or drop confirmation
      </p>
      <p className="mt-1 text-xs text-[#9CA3AF]">
        Drop an .eml / text file, or paste the email. AI still matches the city
        from airports (e.g. HND → Tokyo).
      </p>
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          onClick={() => setOpen(true)}
        >
          Paste confirmation
        </Button>
      ) : (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={compact ? 4 : 7}
            placeholder="Paste flight or hotel confirmation text…"
            className="w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm text-[#080B3A]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void submit({ text })}
            >
              {busy ? "Saving…" : "Save to this city"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message ? (
        <p className="mt-2 text-xs text-[#4B5563]">{message}</p>
      ) : null}
    </div>
  );
}
