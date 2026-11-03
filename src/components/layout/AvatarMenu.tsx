"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/client";

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

  const initial = (displayName || email || "U").charAt(0).toUpperCase();

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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEEEFF] text-sm font-semibold text-[#1616C9]"
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg">
          {email ? (
            <p className="truncate px-3 py-2 text-xs text-[#6B7280]">{email}</p>
          ) : null}
          <Link
            href="/profile"
            className="block px-3 py-2 text-sm hover:bg-[#F7F8FC]"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/dashboard"
            className="block px-3 py-2 text-sm hover:bg-[#F7F8FC] md:hidden"
            onClick={() => setOpen(false)}
          >
            Saved trips
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-[#DC2626] hover:bg-[#F7F8FC]"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
