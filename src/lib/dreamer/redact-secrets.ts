/**
 * Strip payment / credential material before any text is sent to an LLM.
 * Travel fields (flights, hotels, dates, cities) are kept for booking parse.
 */

const CARD_RE =
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;
const CARD_SPACED_RE =
  /\b(?:\d[ -]*?){13,19}\b/g;
const CVV_RE =
  /\b(?:cvv|cvc|cid|security\s*code)\s*[:#]?\s*\d{3,4}\b/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const PASSWORD_RE =
  /\b(?:password|passwd|passcode|otp|one[- ]time\s*code|pin)\s*[:#]?\s*\S+/gi;
const SECRET_URL_RE =
  /https?:\/\/[^\s]+(?:token|password|reset|auth|session)=[^\s]+/gi;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const LONG_DIGIT_RE = /\b\d{14,}\b/g;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function scrubCardLike(text: string): string {
  return text.replace(CARD_SPACED_RE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
      return "[card redacted]";
    }
    return match;
  });
}

/** Redact secrets from confirmation / receipt text before LLM or logging. */
export function redactSecretsForLlm(input: string): string {
  let text = input;
  text = text.replace(PASSWORD_RE, "[credential redacted]");
  text = text.replace(SECRET_URL_RE, "[auth link redacted]");
  text = text.replace(CVV_RE, "[cvv redacted]");
  text = text.replace(SSN_RE, "[id redacted]");
  text = text.replace(IBAN_RE, "[iban redacted]");
  text = text.replace(CARD_RE, "[card redacted]");
  text = scrubCardLike(text);
  text = text.replace(LONG_DIGIT_RE, (m) =>
    m.length >= 16 ? "[number redacted]" : m,
  );
  return text;
}

/**
 * Strip HTML to readable plain text for booking parsers.
 * Keeps line breaks from block tags; drops scripts/styles.
 */
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "");
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text.slice(0, 50_000);
}

/** Prefer plain text; fall back to HTML→text when plain is empty. */
export function confirmationPlainText(input: {
  text?: string | null;
  html?: string | null;
}): string {
  const plain = (input.text ?? "").trim();
  if (plain.length >= 8) return plain.slice(0, 50_000);
  const html = (input.html ?? "").trim();
  if (html) return htmlToPlainText(html);
  return plain.slice(0, 50_000);
}
