"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Sends Supabase email links that landed on the wrong page to the confirmation handler. */
export function AuthReturn() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/auth/callback" || pathname === "/reset-password") return;

    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const type = params.get("type") ?? hashParams.get("type");
    const hasAuth =
      params.has("code") ||
      params.has("token_hash") ||
      hashParams.has("access_token") ||
      hashParams.has("error") ||
      hashParams.has("error_description");
    if (!hasAuth) return;

    if (type === "recovery") {
      router.replace(
        `/reset-password${window.location.search}${window.location.hash}`,
      );
      return;
    }

    const dest = new URL("/auth/callback", window.location.origin);
    params.forEach((value, key) => {
      if (key !== "next") dest.searchParams.set(key, value);
    });
    const next =
      pathname === "/" || pathname === "/login" || pathname === "/signup"
        ? "/dashboard"
        : pathname;
    dest.searchParams.set("next", next);
    router.replace(`${dest.pathname}${dest.search}${hash ? `#${hash}` : ""}`);
  }, [pathname, router]);

  return null;
}
