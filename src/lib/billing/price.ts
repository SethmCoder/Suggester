import { accountlessFetch } from "@/lib/http/accountless-fetch";
import {
  PRO_PRICE_EUR,
  currencyForCountry,
  formatMoney,
  roundMoney,
} from "@/lib/billing/plans";

const FRANKFURTER = "https://api.frankfurter.dev/v1";
const CURRENCY_LIST =
  "https://cdn.jsdelivr.net/gh/umpirsky/currency-list@master/data";

export type ProQuote = {
  amount: number;
  currency: string;
  currencyName: string;
  formatted: string;
  baseAmount: number;
  baseCurrency: "EUR";
  converted: boolean;
};

type Cache<T> = { at: number; value: T };

const DAY = 12 * 60 * 60 * 1000;
let supported: Cache<Map<string, string>> | null = null;
const namesCache = new Map<string, Cache<Record<string, string>>>();
const rates = new Map<string, Cache<number>>();

function localeCandidates(lang: string | null | undefined): string[] {
  const raw = (lang ?? "en").split(",")[0]?.trim().replace("-", "_") || "en";
  const base = raw.split("_")[0] || "en";
  return [...new Set([raw, base, "en"])];
}

async function frankfurterCurrencies(): Promise<Map<string, string>> {
  if (supported && Date.now() - supported.at < DAY) return supported.value;
  const res = await accountlessFetch(`${FRANKFURTER}/currencies`, {
    timeoutMs: 12000,
    retryOnce: false,
  });
  if (!res.ok) throw new Error("rates unavailable");
  const data = (await res.json()) as Record<string, string>;
  const map = new Map(Object.entries(data));
  supported = { at: Date.now(), value: map };
  return map;
}

async function rateFromEur(currency: string): Promise<number> {
  if (currency === "EUR") return 1;
  const hit = rates.get(currency);
  if (hit && Date.now() - hit.at < DAY) return hit.value;
  const res = await accountlessFetch(
    `${FRANKFURTER}/latest?base=EUR&symbols=${encodeURIComponent(currency)}`,
    { timeoutMs: 12000, retryOnce: false },
  );
  if (!res.ok) throw new Error("rates unavailable");
  const data = (await res.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.[currency];
  if (!rate || !Number.isFinite(rate)) throw new Error("rates unavailable");
  rates.set(currency, { at: Date.now(), value: rate });
  return rate;
}

async function currencyNames(locale: string): Promise<Record<string, string>> {
  const hit = namesCache.get(locale);
  if (hit && Date.now() - hit.at < DAY) return hit.value;
  const res = await accountlessFetch(`${CURRENCY_LIST}/${locale}/currency.json`, {
    timeoutMs: 12000,
    retryOnce: false,
  });
  if (!res.ok) throw new Error("names unavailable");
  const data = (await res.json()) as Record<string, string>;
  namesCache.set(locale, { at: Date.now(), value: data });
  return data;
}

async function nameFor(currency: string, lang: string | null | undefined, fallback: string) {
  for (const locale of localeCandidates(lang)) {
    try {
      const names = await currencyNames(locale);
      if (names[currency]) return names[currency];
    } catch {
      /* try the next locale, then the English name from the rate feed */
    }
  }
  return fallback;
}

export async function quoteProPrice(input: {
  country?: string | null;
  lang?: string | null;
}): Promise<ProQuote> {
  const wanted = currencyForCountry(input.country);
  const locale = localeCandidates(input.lang)[0]?.replace("_", "-") || "en";
  try {
    const currencies = await frankfurterCurrencies();
    const currency = currencies.has(wanted) ? wanted : "EUR";
    const rate = await rateFromEur(currency);
    const amount = roundMoney(PRO_PRICE_EUR * rate, currency, locale);
    const currencyName = await nameFor(
      currency,
      input.lang,
      currencies.get(currency) ?? currency,
    );
    return {
      amount,
      currency,
      currencyName,
      formatted: formatMoney(amount, currency, locale),
      baseAmount: PRO_PRICE_EUR,
      baseCurrency: "EUR",
      converted: currency !== "EUR",
    };
  } catch {
    return {
      amount: PRO_PRICE_EUR,
      currency: "EUR",
      currencyName: "Euro",
      formatted: formatMoney(PRO_PRICE_EUR, "EUR", locale),
      baseAmount: PRO_PRICE_EUR,
      baseCurrency: "EUR",
      converted: false,
    };
  }
}
