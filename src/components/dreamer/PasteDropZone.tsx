"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  isImageFile,
  prepareScreenshotDataUrl,
} from "@/lib/dreamer/screenshot-client";

type PasteResult = {
  booking?: unknown;
  planShift?: { shifted?: boolean; tripId?: string };
  error?: string;
  match?: { id: string; kind: string } | null;
  text?: string;
};

export function PasteDropZone({
  preferredFutureTripId,
  onDone,
  compact,
  insertText,
  insertRevision = 0,
  hint,
}: {
  preferredFutureTripId: string;
  onDone?: (result: PasteResult) => void;
  compact?: boolean;
  /** Fills the paste box when insertRevision changes. */
  insertText?: string | null;
  insertRevision?: number;
  /** Optional short note above the paste controls. */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!insertRevision || !insertText?.trim()) return;
    setText(insertText);
    setOpen(true);
    setPreviewUrl(null);
  }, [insertRevision, insertText]);

  const submit = useCallback(
    async (payload: { text?: string; html?: string; image?: string }) => {
      if (!payload.image && !payload.text?.trim() && !payload.html) {
        setMessage("Paste text, or drop / choose a confirmation screenshot.");
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
            image: payload.image,
            preferredFutureTripId,
          }),
        });
        const data = (await res.json()) as PasteResult & {
          error?: string;
          booking?: { id?: string };
          text?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Paste failed");
        const storedText = data.text || payload.text || payload.html || "";
        // Raw bodies stay on-device; cloud inbound_emails omits text/html.
        if (data.booking?.id && storedText) {
          try {
            sessionStorage.setItem(
              `waypoint:dreamer-email:${data.booking.id}`,
              storedText,
            );
          } catch {
            /* quota / private mode */
          }
        }
        setText("");
        setPreviewUrl(null);
        setOpen(false);
        setMessage(
          data.planShift?.shifted
            ? "Booking saved — dream shifted to a plan."
            : payload.image
              ? "Screenshot read and booking saved."
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

  const submitImage = useCallback(
    async (file: File | Blob) => {
      try {
        setBusy(true);
        setMessage("Reading screenshot…");
        const dataUrl = await prepareScreenshotDataUrl(file);
        setPreviewUrl(dataUrl);
        setOpen(true);
        await submit({ image: dataUrl });
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not read image");
        setBusy(false);
      }
    },
    [submit],
  );

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isImageFile(file)) {
      await submitImage(file);
      return;
    }
    if (file) {
      const raw = await file.text();
      await submit({ text: raw });
      return;
    }
    const html = e.dataTransfer.getData("text/html");
    const plain = e.dataTransfer.getData("text/plain");
    await submit({ text: plain || html, html: html || undefined });
  }

  async function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) await submitImage(blob);
        return;
      }
    }
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
      onPaste={(e) => void onPaste(e)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
        Paste, drop, or screenshot
      </p>
      <p className="mt-1 text-xs text-[#9CA3AF]">
        {hint ??
          "Drop an .eml / text file or a confirmation screenshot, paste email text, or paste an image from the clipboard. AI matches the city from airports (e.g. CDG → Paris)."}
      </p>
      {!open ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(true)}
          >
            Paste confirmation
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload screenshot
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Confirmation screenshot preview"
              className="max-h-40 w-auto rounded-[8px] border border-[#E1E5F0]"
            />
          ) : null}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => void onPaste(e)}
            rows={compact ? 4 : 7}
            placeholder="Paste flight or hotel confirmation text, or paste a screenshot…"
            className="w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm text-[#080B3A]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || text.trim().length < 8}
              onClick={() => void submit({ text })}
            >
              {busy ? "Saving…" : "Save to this city"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Use screenshot
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setText("");
                setPreviewUrl(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void submitImage(file);
        }}
      />
      {message ? (
        <p className="mt-2 text-xs text-[#4B5563]">{message}</p>
      ) : null}
    </div>
  );
}
