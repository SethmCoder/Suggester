"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { DreamerBooking } from "@/lib/dreamer/types";

type EmailMeta = {
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
};

export function BookingEmailModal({
  booking,
  open,
  showFullEmail,
  onClose,
  onShowEmail,
}: {
  booking: DreamerBooking | null;
  open: boolean;
  showFullEmail: boolean;
  onClose: () => void;
  onShowEmail: () => void;
}) {
  const [meta, setMeta] = useState<EmailMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRaw, setLocalRaw] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !booking) return;
    setError(null);
    setMeta(null);
    setLocalRaw(null);

    try {
      const raw = sessionStorage.getItem(
        `waypoint:dreamer-email:${booking.id}`,
      );
      setLocalRaw(raw);
    } catch {
      setLocalRaw(null);
    }

    if (booking.id.startsWith("local-")) return;

    setLoading(true);
    void fetch(`/api/dreamer/bookings/${booking.id}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          email?: {
            subject: string | null;
            fromAddress: string | null;
            receivedAt: string | null;
            textBody?: string | null;
            htmlBody?: string | null;
          } | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not load email");
        if (data.email) {
          setMeta({
            subject: data.email.subject,
            fromAddress: data.email.fromAddress,
            receivedAt: data.email.receivedAt,
          });
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => setLoading(false));
  }, [open, booking]);

  if (!open || !booking) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B3A]/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Booking details"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[16px] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[#080B3A]">{booking.title}</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              {booking.summary ||
                [
                  booking.kind,
                  booking.parsed.startDate,
                  booking.parsed.confirmation
                    ? `conf ${booking.parsed.confirmation}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-[#9CA3AF]">Kind</dt>
            <dd className="text-[#080B3A]">{booking.kind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-[#9CA3AF]">Source</dt>
            <dd className="text-[#080B3A]">{booking.source}</dd>
          </div>
          {meta?.fromAddress || booking.parsed.vendor ? (
            <div>
              <dt className="text-xs uppercase text-[#9CA3AF]">From</dt>
              <dd className="text-[#080B3A]">
                {meta?.fromAddress ?? booking.parsed.vendor}
              </dd>
            </div>
          ) : null}
          {meta?.subject ? (
            <div className="col-span-2">
              <dt className="text-xs uppercase text-[#9CA3AF]">Subject</dt>
              <dd className="text-[#080B3A]">{meta.subject}</dd>
            </div>
          ) : null}
          {booking.parsed.fromIata || booking.parsed.toIata ? (
            <div>
              <dt className="text-xs uppercase text-[#9CA3AF]">Route</dt>
              <dd className="text-[#080B3A]">
                {booking.parsed.fromIata ?? "?"} → {booking.parsed.toIata ?? "?"}
              </dd>
            </div>
          ) : null}
          {booking.parsed.startDate ? (
            <div>
              <dt className="text-xs uppercase text-[#9CA3AF]">Date</dt>
              <dd className="text-[#080B3A]">{booking.parsed.startDate}</dd>
            </div>
          ) : null}
          {booking.parsed.cabin ? (
            <div>
              <dt className="text-xs uppercase text-[#9CA3AF]">Cabin</dt>
              <dd className="text-[#080B3A]">{booking.parsed.cabin}</dd>
            </div>
          ) : null}
          {booking.parsed.hotelName ? (
            <div className="col-span-2">
              <dt className="text-xs uppercase text-[#9CA3AF]">Hotel</dt>
              <dd className="text-[#080B3A]">{booking.parsed.hotelName}</dd>
            </div>
          ) : null}
          {booking.parsed.confirmation ? (
            <div>
              <dt className="text-xs uppercase text-[#9CA3AF]">Confirmation</dt>
              <dd className="text-[#080B3A]">{booking.parsed.confirmation}</dd>
            </div>
          ) : null}
        </dl>

        {!showFullEmail ? (
          <Button type="button" className="mt-5" onClick={onShowEmail}>
            Show original email
          </Button>
        ) : (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase text-[#6B7280]">
              Original email (this device)
            </p>
            {loading ? (
              <p className="mt-2 text-sm text-[#6B7280]">Loading…</p>
            ) : error && !localRaw ? (
              <p className="mt-2 text-sm text-[#B91C1C]">{error}</p>
            ) : localRaw ? (
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#F5F7FF] p-3 text-xs text-[#080B3A]">
                {meta?.subject ? `Subject: ${meta.subject}\n\n` : ""}
                {localRaw}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-[#6B7280]">
                Raw email isn’t stored in the cloud. Open this booking on the
                device where you pasted it to see the original.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
