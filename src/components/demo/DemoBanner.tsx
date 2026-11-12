"use client";

import { useRouter } from "next/navigation";
import { DEMO_BANNER } from "@/lib/demo/data";

export function DemoBanner() {
  const router = useRouter();

  async function exitDemo() {
    await fetch("/api/demo/end", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mb-5 flex flex-col gap-2 rounded-[14px] border border-[#DDE1FF] bg-white px-4 py-3 text-sm text-[#080B3A] shadow-[0_4px_16px_rgba(8,11,58,0.04)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-[#0400FF] px-2 text-[10px] font-semibold uppercase tracking-wide text-white">
          Demo
        </span>
        <p className="leading-relaxed text-[#374151]">{DEMO_BANNER}</p>
      </div>
      <button
        type="button"
        onClick={exitDemo}
        className="shrink-0 rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0400FF] transition hover:border-[#0400FF]/30 hover:bg-[#F5F7FF]"
      >
        Exit demo
      </button>
    </div>
  );
}
