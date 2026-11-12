import { groqChat, groqVisionChat, groqVisionModel } from "@/lib/ai/groq";
import { redactSecretsForLlm } from "@/lib/dreamer/redact-secrets";
import { cleanScreenshotTranscript, normalizeScreenshotDataUrl } from "@/lib/dreamer/parse-screenshot";
import {
  EXPENSE_CATEGORIES,
  migrateExpenseCategory,
  type ExpenseCategory,
} from "@/lib/trips/expenses";

export type ParsedReceipt = {
  label: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  purchasedAt?: string;
  note?: string;
};

const RECEIPT_JSON_PROMPT = `You extract purchase fields from receipt or payment text.
Categories must be exactly one of: ${EXPENSE_CATEGORIES.join(", ")}.
- souvenirs: gifts, merch, duty-free goods
- things_to_do: tickets, tours, attractions, experiences
- eating: restaurants, cafes, groceries for meals
- transit: trains, buses, rideshare, fuel, parking
- hotel: lodging, resort fees

Return JSON only:
{
  "label": "short merchant or item name",
  "amount": 12.34,
  "currency": "USD",
  "category": "eating",
  "purchasedAt": "YYYY-MM-DD or omit",
  "note": "optional detail"
}
Use the total paid when multiple amounts appear. Do not invent fields you cannot see.`;

const RECEIPT_VISION_PROMPT = `Read this receipt or payment screenshot. Transcribe merchant, date, currency, total amount, and line items.
Do NOT transcribe full card numbers, CVV, PIN, or account numbers — omit payment credentials.
Plain text only — no markdown.`;

function parseReceiptJson(raw: string): ParsedReceipt | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const label =
      typeof parsed.label === "string" && parsed.label.trim()
        ? parsed.label.trim().slice(0, 120)
        : "";
    const amount = Number(parsed.amount);
    const currency =
      typeof parsed.currency === "string" && parsed.currency.trim()
        ? parsed.currency.trim().toUpperCase()
        : "";
    const category = migrateExpenseCategory(parsed.category);
    if (!label || !currency || !category) return null;
    if (!Number.isFinite(amount) || amount < 0) return null;
    const purchasedAt =
      typeof parsed.purchasedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(parsed.purchasedAt)
        ? parsed.purchasedAt.slice(0, 10)
        : undefined;
    const note =
      typeof parsed.note === "string" && parsed.note.trim()
        ? parsed.note.trim().slice(0, 400)
        : undefined;
    return { label, amount, currency, category, purchasedAt, note };
  } catch {
    return null;
  }
}

export async function parseReceiptFromText(text: string): Promise<ParsedReceipt | null> {
  const trimmed = text.trim();
  if (trimmed.length < 4) return null;
  if (!process.env.GROQ_API_KEY) return parseReceiptFromTextLocal(trimmed);
  const raw = await groqChat({
    temperature: 0.1,
    effort: "low",
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: RECEIPT_JSON_PROMPT },
      {
        role: "user",
        content: redactSecretsForLlm(trimmed).slice(0, 12_000),
      },
    ],
  });
  if (!raw) return parseReceiptFromTextLocal(trimmed);
  return parseReceiptJson(raw);
}

/** Lightweight regex fallback when AI is unavailable. */
export function parseReceiptFromTextLocal(text: string): ParsedReceipt | null {
  const amountMatch =
    text.match(/(?:total|amount due|grand total|amt)[:\s]*\$?\s*([\d,]+\.?\d*)/i) ||
    text.match(/\$\s*([\d,]+\.\d{2})/) ||
    text.match(/([\d,]+\.\d{2})\s*(USD|EUR|GBP|JPY|CAD)/i);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const currency =
    (amountMatch[2] && String(amountMatch[2]).toUpperCase()) ||
    (text.includes("€") ? "EUR" : text.includes("£") ? "GBP" : "USD");
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const label = (lines[0] || "Receipt").slice(0, 120);
  const lower = text.toLowerCase();
  let category: ExpenseCategory = "souvenirs";
  if (/hotel|lodging|resort|inn\b/.test(lower)) category = "hotel";
  else if (/uber|lyft|metro|transit|train|bus|taxi|parking/.test(lower)) category = "transit";
  else if (/museum|ticket|tour|admission|attraction/.test(lower)) category = "things_to_do";
  else if (/restaurant|cafe|coffee|food|diner|bar\b|bakery/.test(lower)) category = "eating";
  return { label, amount, currency, category };
}

async function transcribeReceiptImage(dataUrl: string): Promise<string | null> {
  const normalized = normalizeScreenshotDataUrl(dataUrl);
  if ("error" in normalized) return null;
  const raw = await groqVisionChat({
    model: groqVisionModel(),
    temperature: 0.1,
    effort: "low",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: RECEIPT_VISION_PROMPT },
          { type: "image_url", image_url: { url: normalized.dataUrl } },
        ],
      },
    ],
  });
  if (!raw) return null;
  const cleaned = cleanScreenshotTranscript(raw);
  return cleaned.length >= 4 ? cleaned : null;
}

export async function parseReceiptInput(input: {
  text?: string | null;
  screenshotDataUrl?: string | null;
}): Promise<
  | { receipt: ParsedReceipt }
  | { error: string; status: number }
> {
  let combined = (input.text ?? "").trim();
  if (input.screenshotDataUrl) {
    const normalized = normalizeScreenshotDataUrl(input.screenshotDataUrl);
    if ("error" in normalized) {
      return { error: normalized.error, status: 400 };
    }
    if (!process.env.GROQ_API_KEY) {
      return {
        error:
          "Screenshot parsing needs AI configured (GROQ_API_KEY). Paste receipt text instead.",
        status: 503,
      };
    }
    const transcribed = await transcribeReceiptImage(normalized.dataUrl);
    if (!transcribed) {
      return {
        error: "Could not read that image — try a clearer crop or paste the text.",
        status: 422,
      };
    }
    combined = combined ? `${combined}\n\n${transcribed}` : transcribed;
  }
  if (!combined) {
    return { error: "Paste receipt text or attach a screenshot.", status: 400 };
  }
  const receipt = await parseReceiptFromText(combined);
  if (!receipt) {
    return {
      error: "Could not find amount and merchant — add details manually.",
      status: 422,
    };
  }
  return { receipt };
}
