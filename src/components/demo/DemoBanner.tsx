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
    <div className="flex flex-col gap-2 rounded-[12px] border border-[#0400FF]/20 bg-[#DDE1FF] px-4 py-3 text-sm text-[#080B3A] sm:flex-row sm:items-center sm:justify-between">
      <p className="font-medium">{DEMO_BANNER}</p>
      <button
        type="button"
        onClick={exitDemo}
        className="shrink-0 font-semibold text-[#0400FF] underline hover:text-[#0A0080]"
      >
        Back to start
      </button>
    </div>
  );
}
