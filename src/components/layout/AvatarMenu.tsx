"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function AvatarMenu({
  email,
  displayName,
}: {
  email?: string | null;
  displayName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function signOut() {
    await fetch("/api/demo/end", { method: "POST" }).catch(() => null);
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#6B7280] hover:bg-[#DDE1FF] hover:text-[#080B3A]"
        aria-label="Account menu"
      >
        Account
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-[12px] border border-[#E1E5F0] bg-white py-1 shadow-[0_8px_28px_rgba(8,11,58,0.12)]">
          {email ? (
            <p className="truncate border-b border-[#E1E5F0] px-3 py-2 text-xs text-[#6B7280]">
              {displayName ? `${displayName} · ` : ""}
              {email}
            </p>
          ) : null}
          <Link
            href="/settings"
            className="block px-3 py-2.5 text-sm text-[#1F2937] hover:bg-[#F5F7FF]"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <Link
            href="/profile"
            className="block px-3 py-2.5 text-sm text-[#1F2937] hover:bg-[#F5F7FF]"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/dashboard"
            className="block px-3 py-2.5 text-sm text-[#1F2937] hover:bg-[#F5F7FF]"
            onClick={() => setOpen(false)}
          >
            My Trips
          </Link>
          <button
            type="button"
            className="block w-full border-t border-[#E1E5F0] px-3 py-2.5 text-left text-sm text-[#DC2626] hover:bg-[#FEF2F2]"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
