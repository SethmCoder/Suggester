/** Browser helpers for confirmation screenshots before upload. */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });
}

/** Compress / downscale a screenshot so paste JSON stays under server limits. */
export async function prepareScreenshotDataUrl(
  file: File | Blob,
): Promise<string> {
  const type = file.type || "image/png";
  if (!type.startsWith("image/")) {
    throw new Error("Drop a screenshot image (PNG, JPEG, WebP).");
  }

  const rawUrl = await readFileAsDataUrl(
    file instanceof File
      ? file
      : new File([file], "screenshot.png", { type }),
  );

  // Small enough already — skip canvas work.
  if (file.size <= 900_000 && type !== "image/png") {
    return rawUrl;
  }

  try {
    const img = await loadImage(rawUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return rawUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return rawUrl;
  }
}

export function isImageFile(file: File | Blob | null | undefined): boolean {
  return Boolean(file?.type?.startsWith("image/"));
}
