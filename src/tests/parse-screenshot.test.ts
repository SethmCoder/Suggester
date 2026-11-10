import { afterEach, describe, expect, it } from "vitest";
import {
  cleanScreenshotTranscript,
  normalizeScreenshotDataUrl,
} from "@/lib/dreamer/parse-screenshot";
import { parseAndSummarize } from "@/lib/dreamer/ingest";
import {
  DEFAULT_GROQ_VISION_MODEL,
  groqVisionModel,
} from "@/lib/ai/groq";

const previousVision = process.env.GROQ_VISION_MODEL;
const previousModel = process.env.GROQ_MODEL;

afterEach(() => {
  if (previousVision == null) delete process.env.GROQ_VISION_MODEL;
  else process.env.GROQ_VISION_MODEL = previousVision;
  if (previousModel == null) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = previousModel;
});

describe("screenshot confirmation parse", () => {
  it("rejects non-image data URLs", () => {
    const result = normalizeScreenshotDataUrl("data:text/plain;base64,YWJj");
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/JPEG|PNG|WebP|GIF/i),
      }),
    );
  });

  it("accepts a small PNG data URL", () => {
    // 1x1 transparent PNG
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const result = normalizeScreenshotDataUrl(png);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.mimeType).toBe("image/png");
    expect(result.byteLength).toBeGreaterThan(30);
  });

  it("normalizes image/jpg to image/jpeg", () => {
    const jpg =
      "data:image/jpg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";
    const result = normalizeScreenshotDataUrl(jpg);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("strips markdown fences from vision transcripts", () => {
    expect(
      cleanScreenshotTranscript("```text\nSEA → HND Confirmation ABC123\n```"),
    ).toBe("SEA → HND Confirmation ABC123");
  });

  it("parses a transcribed screenshot the same as pasted email text", () => {
    const transcript = `
      Alaska Airlines
      Flight AS123 SEA → HND
      Date: 2026-07-20
      Departs 9:15 AM Arrives 1:05 PM
      Confirmation: XK9PL2
    `;
    const { parsed, summary } = parseAndSummarize({
      subject: "Screenshot booking",
      text: cleanScreenshotTranscript(transcript),
    });
    expect(parsed.fromIata).toBe("SEA");
    expect(parsed.toIata).toBe("HND");
    expect(parsed.startDate).toBe("2026-07-20");
    expect(parsed.confirmation).toBe("XK9PL2");
    expect(parsed.flightNumber).toBe("AS123");
    expect(summary.toLowerCase()).toMatch(/sea|hnd|xk9pl2/i);
  });

  it("defaults vision model to qwen multimodal when text model is gpt-oss", () => {
    delete process.env.GROQ_VISION_MODEL;
    delete process.env.GROQ_MODEL;
    expect(groqVisionModel()).toBe(DEFAULT_GROQ_VISION_MODEL);
  });

  it("respects GROQ_VISION_MODEL", () => {
    process.env.GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
    expect(groqVisionModel()).toBe(
      "meta-llama/llama-4-scout-17b-16e-instruct",
    );
  });
});
