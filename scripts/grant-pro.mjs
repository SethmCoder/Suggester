#!/usr/bin/env node
/**
 * Upgrade a single account to Pro (or downgrade to free).
 *
 * Usage:
 *   node scripts/grant-pro.mjs you@example.com
 *   node scripts/grant-pro.mjs you@example.com free
 *
 * Requires WAYPOINT_GRANT_SECRET in .env.local / env, and a running app
 * (NEXT_PUBLIC_SITE_URL or http://localhost:3001).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const email = process.argv[2];
const tier = (process.argv[3] || "pro").toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/grant-pro.mjs email@example.com [pro|free]");
  process.exit(1);
}
if (tier !== "pro" && tier !== "free") {
  console.error("Tier must be pro or free");
  process.exit(1);
}

const secret = process.env.WAYPOINT_GRANT_SECRET;
if (!secret || secret.length < 8) {
  console.error("Set WAYPOINT_GRANT_SECRET (8+ chars) in .env.local first.");
  process.exit(1);
}

const base =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";

const res = await fetch(`${base}/api/billing/grant`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-waypoint-grant-secret": secret,
  },
  body: JSON.stringify({ email, tier, secret }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(data.error || `HTTP ${res.status}`);
  process.exit(1);
}
console.log(`OK · ${tier} · ${email} · userId ${data.userId} · via ${data.via}`);
