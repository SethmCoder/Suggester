export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let email: string | null = null;
  let displayName: string | null = null;

  const cookieStore = await cookies();
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  if (demo) {
    // Demo account wins — never show a personal email while demo is active.
    return (
      <AppShell userEmail="demo@waypoint.app" displayName="Demo traveler">
        {children}
      </AppShell>
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      displayName = profile?.display_name ?? null;
    }
  } catch {
    /* Supabase optional */
  }

  return (
    <AppShell userEmail={email} displayName={displayName}>
      {children}
    </AppShell>
  );
}
