"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Props = {
  children: ReactNode;
  className?: string;
  /** Optional pathname to return to after signup completes. */
  next?: string;
};

/**
 * Always opens the create-account form. Ends demo mode and signs out any
 * existing session first so middleware cannot bounce to the dashboard.
 */
export function CreateAccountLink({ children, className, next }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function openSignup(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/demo/end", { method: "POST" }).catch(() => null);
      if (isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
      }
      const href = next
        ? `/signup?next=${encodeURIComponent(next)}`
        : "/signup";
      router.push(href);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Link
      href="/signup"
      className={className}
      onClick={openSignup}
      aria-disabled={busy}
    >
      {busy ? "Opening…" : children}
    </Link>
  );
}
