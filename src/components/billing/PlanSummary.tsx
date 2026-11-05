"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countCreatedOfflineTrips } from "@/lib/offline/trips";
import type { BillingSnapshot } from "@/lib/billing/plans";

function label(snapshot: BillingSnapshot) {
  if (snapshot.plan === "pro") {
    return "Pro · unlimited trips · full planner.";
  }
  return `Free · ${snapshot.used} of ${snapshot.limit} trips · standard planner.`;
}

export function PlanSummary({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [text, setText] = useState("Checking your plan…");

  useEffect(() => {
    const created = countCreatedOfflineTrips();
    fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", created }),
    })
      .then((res) => res.json())
      .then((data: BillingSnapshot) => setText(label(data)))
      .catch(() => setText("Free · standard planner."));
  }, []);

  const light = tone === "light";
  return (
    <p className={`text-sm ${light ? "text-[#C5CAE5]" : "text-[#6B7280]"}`}>
      {text}{" "}
      <Link
        href="/plan"
        className={`font-semibold underline ${light ? "text-white" : "text-[#0400FF]"}`}
      >
        See plans
      </Link>
    </p>
  );
}
