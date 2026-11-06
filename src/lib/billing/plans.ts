export const PLAN_COOKIE = "waypoint_plan";
export const USED_COOKIE = "waypoint_trips_used";

/** Trips a free plan can create. Sample trips are not counted. */
export const FREE_TRIP_LIMIT = 3;

/** Monthly Pro price in euros. Frankfurter converts this into the local currency. */
export const PRO_PRICE_EUR = 9;

/** Smaller Groq model used on the free plan. */
export const FREE_MODEL = "openai/gpt-oss-120b";

export type PlanId = "free" | "pro";

export type BillingSnapshot = {
  plan: PlanId;
  used: number;
  limit: number | null;
  remaining: number | null;
};

export function proModel(): string {
  return process.env.GROQ_PRO_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b";
}

export function readPlan(get: (name: string) => string | undefined): BillingSnapshot {
  const plan: PlanId = get(PLAN_COOKIE) === "pro" ? "pro" : "free";
  const used = Math.max(0, Math.floor(Number(get(USED_COOKIE)) || 0));
  const limit = plan === "pro" ? null : FREE_TRIP_LIMIT;
  const remaining = limit == null ? null : Math.max(0, limit - used);
  return { plan, used, limit, remaining };
}

export function canCreateTrip(state: Pick<BillingSnapshot, "plan" | "used">): boolean {
  return state.plan === "pro" || state.used < FREE_TRIP_LIMIT;
}

export const PLAN_LIMIT_MESSAGE =
  "Free includes 3 trips. Upgrade to Pro for unlimited trips and the full planner.";

const EUROZONE = new Set([
  "AD", "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE",
  "IT", "LT", "LU", "LV", "MC", "ME", "MT", "NL", "PT", "SI", "SK", "SM", "VA", "XK",
]);

const COUNTRY_CURRENCY: Record<string, string> = {
  AE: "AED", AU: "AUD", BG: "BGN", BR: "BRL", CA: "CAD", CH: "CHF", CN: "CNY",
  CZ: "CZK", DK: "DKK", GB: "GBP", HK: "HKD", HU: "HUF", ID: "IDR", IL: "ILS",
  IN: "INR", IS: "ISK", JP: "JPY", KR: "KRW", MX: "MXN", MY: "MYR", NO: "NOK",
  NZ: "NZD", PH: "PHP", PL: "PLN", RO: "RON", SA: "SAR", SE: "SEK", SG: "SGD",
  TH: "THB", TR: "TRY", US: "USD", ZA: "ZAR",
};

/** ISO country code to the currency Frankfurter can usually price. */
export function currencyForCountry(countryCode: string | null | undefined): string {
  const code = (countryCode ?? "").trim().toUpperCase();
  if (!code || EUROZONE.has(code)) return "EUR";
  return COUNTRY_CURRENCY[code] ?? "EUR";
}

export function roundMoney(amount: number, currency: string, locale = "en"): number {
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  const factor = 10 ** digits;
  return Math.round(amount * factor) / factor;
}

export function formatMoney(amount: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
