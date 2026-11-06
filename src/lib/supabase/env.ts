/** Helpers for Vercel + local Supabase configuration checks. */

export function getSupabasePublicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicEnv();
  return Boolean(url && anonKey);
}

export function isSupabaseServerConfigured(): boolean {
  return (
    isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

/** Origin used for auth redirects. A path on NEXT_PUBLIC_SITE_URL is ignored. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}
