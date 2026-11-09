"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  DEMO_CARD_PLACEHOLDER,
  demoCheckoutAmount,
  demoCheckoutProductName,
  type DemoCheckoutInterval,
} from "@/lib/billing/demo-checkout";

type Step = "review" | "pay" | "done";

type Props = {
  open: boolean;
  interval: DemoCheckoutInterval;
  onClose: () => void;
  onIntervalChange?: (interval: DemoCheckoutInterval) => void;
};

export function DemoCheckout({
  open,
  interval,
  onClose,
  onIntervalChange,
}: Props) {
  const titleId = useId();
  const [step, setStep] = useState<Step>("review");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Alex Traveler");
  const [email, setEmail] = useState("demo@waypoint.local");
  const [card, setCard] = useState(DEMO_CARD_PLACEHOLDER);
  const [expiry, setExpiry] = useState("12 / 30");
  const [cvc, setCvc] = useState("123");
  const amount = demoCheckoutAmount(interval);

  useEffect(() => {
    if (!open) return;
    setStep("review");
    setBusy(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function pretendPay() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 900));
    setBusy(false);
    setStep("done");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#080B3A]/45 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-[16px] border border-[#E1E5F0] bg-white shadow-[0_24px_64px_rgba(8,11,58,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E1E5F0] bg-[#F5F7FF] px-5 py-3">
          <div>
            <p
              id={titleId}
              className="text-sm font-semibold text-[#080B3A]"
            >
              Checkout preview
            </p>
            <p className="text-xs text-[#6B7280]">
              Demo only — no card is charged, Pro is not turned on.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-[#6B7280] hover:bg-white hover:text-[#080B3A]"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 p-5">
          {step === "review" ? (
            <>
              <div className="rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Order
                </p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#080B3A]">
                      {demoCheckoutProductName(interval)}
                    </p>
                    <p className="text-sm text-[#6B7280]">{amount.cadence}</p>
                  </div>
                  <p className="text-lg font-bold text-[#080B3A]">
                    {amount.label}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      interval === "month"
                        ? "bg-[#0400FF] text-white"
                        : "bg-white text-[#1F2937] ring-1 ring-[#E1E5F0]"
                    }`}
                    onClick={() => onIntervalChange?.("month")}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      interval === "year"
                        ? "bg-[#0400FF] text-white"
                        : "bg-white text-[#1F2937] ring-1 ring-[#E1E5F0]"
                    }`}
                    onClick={() => onIntervalChange?.("year")}
                  >
                    Annual
                  </button>
                </div>
              </div>
              <Button type="button" className="w-full" onClick={() => setStep("pay")}>
                Continue to payment
              </Button>
            </>
          ) : null}

          {step === "pay" ? (
            <>
              <div className="space-y-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label>Name on card</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="cc-name"
                  />
                </div>
                <div>
                  <Label>Card number</Label>
                  <Input
                    value={card}
                    onChange={(e) => setCard(e.target.value)}
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Expiry</Label>
                    <Input
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      autoComplete="cc-exp"
                    />
                  </div>
                  <div>
                    <Label>CVC</Label>
                    <Input
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      autoComplete="cc-csc"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-[#6B7280]">
                Sample details are prefilled. Submitting only advances this
                preview — nothing is sent to Stripe.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void pretendPay()}
                >
                  {busy
                    ? "Processing…"
                    : `Pay ${amount.label} · demo`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setStep("review")}
                >
                  Back
                </Button>
              </div>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <div className="rounded-[12px] border border-[#0400FF]/20 bg-[#F5F7FF] p-4 text-center">
                <p className="text-lg font-semibold text-[#080B3A]">
                  Demo payment complete
                </p>
                <p className="mt-2 text-sm text-[#6B7280]">
                  In production, Stripe Checkout would confirm here and unlock
                  Pro on the account. This preview did not charge a card or
                  change your plan.
                </p>
                <p className="mt-3 text-sm font-medium text-[#080B3A]">
                  {demoCheckoutProductName(interval)} · {amount.label}{" "}
                  {amount.cadence}
                </p>
              </div>
              <Button type="button" className="w-full" onClick={onClose}>
                Back to plans
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
