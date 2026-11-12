import { NextResponse } from "next/server";

/**
 * Phase 5 scaffold — Gmail OAuth connect.
 * Does not claim a connection without real tokens.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || ""}/api/gmail/callback`;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Gmail connection isn't available yet. Paste or forward booking emails in Future Trips instead.",
        connected: false,
      },
      { status: 501 },
    );
  }

  // Structure only — do not redirect to Google until token storage + callback exist.
  return NextResponse.json(
    {
      error:
        "Gmail OAuth credentials are present, but the connect flow is not enabled yet. Forward or paste confirmations still work.",
      connected: false,
      configured: true,
    },
    { status: 501 },
  );
}

export async function POST() {
  return GET();
}
