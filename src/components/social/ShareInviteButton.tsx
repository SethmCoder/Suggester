"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type ShareKind = "trip" | "future_trip" | "wishlist_collection";

function sharePath(kind: ShareKind, id: string) {
  if (kind === "trip") return `/api/trips/${id}/share`;
  if (kind === "future_trip") return `/api/future-trips/${id}/share`;
  return `/api/wishlist/collections/${id}/share`;
}

export function ShareInviteButton({
  kind,
  resourceId,
  className = "",
  disabled = false,
}: {
  kind: ShareKind;
  resourceId: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(sharePath(kind, resourceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permission: "view" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not share");
      setMessage(`Invite sent to ${email.trim()}.`);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        Share
      </Button>
      {open ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-[12px] border border-[#E1E5F0] bg-white p-3 shadow-[0_8px_24px_rgba(8,11,58,0.08)]">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-[#6B7280]">
              Friend&apos;s email
            </label>
            <Input
              type="email"
              placeholder="friend@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !email.trim()}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : "Send invite"}
          </Button>
          {message ? (
            <p className="w-full text-xs font-medium text-[#047857]">{message}</p>
          ) : null}
          {error ? (
            <p className="w-full text-xs font-medium text-[#B91C1C]">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
