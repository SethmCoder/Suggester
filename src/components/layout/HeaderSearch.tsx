"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { IconSearch } from "@/components/ui/Icons";

/** Global header search that routes into the right feature with the query. */
export function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    if (/\bwishlist\b|\bsaved\b/.test(lower)) {
      router.push("/wishlist");
      return;
    }
    if (/\bdream/.test(lower)) {
      router.push("/dreamer");
      return;
    }
    if (/\bplan\b|\bpro\b|\bupgrade\b/.test(lower)) {
      router.push("/plan");
      return;
    }
    router.push(`/discover?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="relative min-w-0 flex-1 max-w-xl" role="search">
      <IconSearch
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9299B5]"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search trips, places, plans…"
        aria-label="Search trips, places, and plans"
        className="h-10 w-full rounded-[12px] border border-[#D1D7E5] bg-[#F5F7FF] pl-9 pr-3 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
      />
    </form>
  );
}
