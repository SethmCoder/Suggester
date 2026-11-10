import { roundMoney } from "@/lib/billing/plans";

const FRANKFURTER = "https://api.frankfurter.dev/v1";

export type FxConvertResult = {
  amount: number;
  from: string;
  to: string;
  converted: number;
  rate: number;
  date?: string;
};

/** Convert using Frankfurter latest rates (ECB reference rates). */
export async function convertCurrency(input: {
  amount: number;
  from: string;
  to: string;
  fetchImpl?: typeof fetch;
}): Promise<FxConvertResult> {
  const from = input.from.trim().toUpperCase();
  const to = input.to.trim().toUpperCase();
  const amount = Number(input.amount);
  if (!from || !to || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid FX conversion input");
  }
  if (from === to) {
    return {
      amount,
      from,
      to,
      converted: roundMoney(amount, to),
      rate: 1,
    };
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const url = `${FRANKFURTER}/latest?amount=${encodeURIComponent(String(amount))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetchFn(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("FX rates unavailable");
  const data = (await res.json()) as {
    amount?: number;
    base?: string;
    date?: string;
    rates?: Record<string, number>;
  };
  const convertedRaw = data.rates?.[to];
  if (!Number.isFinite(convertedRaw)) throw new Error("FX rates unavailable");
  const converted = roundMoney(convertedRaw as number, to);
  const rate = amount > 0 ? converted / amount : convertedRaw!;
  return {
    amount,
    from,
    to,
    converted,
    rate,
    date: typeof data.date === "string" ? data.date : undefined,
  };
}
