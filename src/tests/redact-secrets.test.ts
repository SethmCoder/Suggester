import { describe, expect, it } from "vitest";
import {
  confirmationPlainText,
  htmlToPlainText,
  redactSecretsForLlm,
} from "@/lib/dreamer/redact-secrets";
import { verifyInboundSignature } from "@/lib/dreamer/parse-email";
import { createHmac } from "crypto";

describe("redactSecretsForLlm", () => {
  it("redacts card-like and password material but keeps flight fields", () => {
    const raw =
      "Flight NH118 HND→SEA confirmation ABCDEF password: hunter2 card 4111111111111111 cvv 123";
    const out = redactSecretsForLlm(raw);
    expect(out).toMatch(/NH118/);
    expect(out).toMatch(/ABCDEF/);
    expect(out).not.toMatch(/hunter2/);
    expect(out).not.toMatch(/4111111111111111/);
    expect(out).not.toMatch(/cvv 123/i);
  });
});

describe("htmlToPlainText / confirmationPlainText", () => {
  it("converts HTML-only confirmations into parseable text", () => {
    const html =
      "<html><body><p>Confirmation: XYZ123</p><p>Flight NH118 from HND to SEA</p><p>2026-05-10</p></body></html>";
    const text = confirmationPlainText({ text: "", html });
    expect(text).toMatch(/XYZ123/);
    expect(text).toMatch(/NH118/);
    expect(htmlToPlainText(html)).toMatch(/Flight NH118/);
  });
});

describe("verifyInboundSignature", () => {
  it("rejects substring secret matches", () => {
    process.env.DREAMER_INBOUND_ALLOW_UNSIGNED = "0";
    expect(
      verifyInboundSignature("{}", "prefix-secret-suffix", "secret"),
    ).toBe(false);
  });

  it("accepts exact shared secret", () => {
    expect(verifyInboundSignature("{}", "my-secret", "my-secret")).toBe(true);
  });

  it("accepts hmac hex of body", () => {
    const secret = "webhook-secret";
    const body = '{"ok":true}';
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyInboundSignature(body, `sha256=${hex}`, secret)).toBe(true);
  });
});
