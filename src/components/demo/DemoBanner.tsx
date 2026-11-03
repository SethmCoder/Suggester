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
    <div className="mb-6 flex flex-col gap-2 rounded-xl border border-[#B45309]/40 bg-[#FFFBEB] px-4 py-3 text-sm text-[#B45309] sm:flex-row sm:items-center sm:justify-between">
      <p>{DEMO_BANNER}</p>
      <button
        type="button"
        onClick={exitDemo}
        className="shrink-0 font-medium underline hover:no-underline"
      >
        Exit demo
      </button>
    </div>
  );
}
