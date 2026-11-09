/** Comma-separated emails that always receive Pro (no Stripe). */
export function proEmailsFromEnv(
  raw = process.env.WAYPOINT_PRO_EMAILS,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function emailGrantedPro(
  email: string | null | undefined,
  raw = process.env.WAYPOINT_PRO_EMAILS,
): boolean {
  if (!email) return false;
  return proEmailsFromEnv(raw).includes(email.trim().toLowerCase());
}

/** Dev/demo: signed-in users may unlock Pro for themselves without Stripe. */
export function selfProGrantEnabled(
  env = process.env.WAYPOINT_ALLOW_SELF_PRO_GRANT,
): boolean {
  return env === "1" || env === "true";
}

export function grantSecretConfigured(
  secret = process.env.WAYPOINT_GRANT_SECRET,
): boolean {
  return Boolean(secret && secret.length >= 8);
}

export function grantSecretMatches(
  provided: string | null | undefined,
  secret = process.env.WAYPOINT_GRANT_SECRET,
): boolean {
  if (!secret || secret.length < 8 || !provided) return false;
  return provided === secret;
}
