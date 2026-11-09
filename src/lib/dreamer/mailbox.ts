/**
 * Shared Dreamer inbox — every traveler forwards confirmations to the same address.
 * Ownership is resolved from the From / sender address (who forwarded), not a +token.
 */

export function sharedInboundAddress(): string {
  const explicit = process.env.DREAMER_INBOUND_ADDRESS?.trim();
  if (explicit) return explicit.toLowerCase();
  const domain = process.env.DREAMER_INBOUND_DOMAIN?.trim();
  if (domain) return `bookings@${domain}`.toLowerCase();
  return "bookings@gmail.com";
}

export function normalizeEmail(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(address);
  return m ? m[1].toLowerCase() : null;
}

/** Local part before @ — used as a soft username match. */
export function emailLocalPart(address: string | null | undefined): string | null {
  const email = normalizeEmail(address);
  if (!email) return null;
  return email.split("@")[0] || null;
}

/**
 * Prefer the person who forwarded the mail.
 * Gmail forwards usually put the account owner in From; some clients use Reply-To.
 */
export function extractSenderCandidates(input: {
  from?: string | null;
  replyTo?: string | null;
  sender?: string | null;
  textBody?: string | null;
}): string[] {
  const out: string[] = [];
  for (const raw of [input.from, input.replyTo, input.sender]) {
    const n = normalizeEmail(raw);
    if (n && !out.includes(n)) out.push(n);
  }
  // "From: Name <user@gmail.com>" lines inside a forwarded body
  const body = input.textBody ?? "";
  for (const m of body.matchAll(
    /^(?:from|sender)\s*:\s*.*?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gim,
  )) {
    const n = m[1].toLowerCase();
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export type OwnerLookupUser = {
  id: string;
  email?: string | null;
  /** Optional display / login name without domain. */
  username?: string | null;
};

/**
 * Match inbound mail to an account by who sent/forwarded it.
 * 1) Exact email match
 * 2) Local-part / username match (e.g. seth@gmail.com → username "seth")
 */
export function resolveOwnerBySender(
  senders: string[],
  users: OwnerLookupUser[],
): { ownerId: string; matchedBy: "email" | "username"; sender: string } | null {
  const normalizedUsers = users.map((u) => ({
    id: u.id,
    email: u.email?.toLowerCase() ?? null,
    username: (u.username || emailLocalPart(u.email) || "").toLowerCase() || null,
  }));

  for (const sender of senders) {
    const email = normalizeEmail(sender);
    if (!email) continue;
    const byEmail = normalizedUsers.find((u) => u.email === email);
    if (byEmail) {
      return { ownerId: byEmail.id, matchedBy: "email", sender: email };
    }
  }

  for (const sender of senders) {
    const local = emailLocalPart(sender);
    if (!local || local.length < 2) continue;
    const matches = normalizedUsers.filter((u) => u.username === local);
    if (matches.length === 1) {
      return {
        ownerId: matches[0].id,
        matchedBy: "username",
        sender: normalizeEmail(sender) ?? sender,
      };
    }
  }

  return null;
}
