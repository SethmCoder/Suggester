"use client";

import { BillingPlansPanel } from "@/components/billing/BillingPlansPanel";

export default function PricingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#080B3A]">
          Pricing
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#6B7280]">
          Free for research basics. Plus for unlimited trips. Trip Pass for one
          trip when you only need premium tools once.
        </p>
      </div>
      <BillingPlansPanel heading="Plans" />
    </div>
  );
}
