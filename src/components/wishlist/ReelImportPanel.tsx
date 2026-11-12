"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ReelPlaceCandidate } from "@/lib/wishlist/parse-reel";
import type { WishlistCategory, WishlistItem } from "@/lib/wishlist/types";
import { saveWishlistItem } from "@/lib/wishlist/sync";

const CATEGORY_LABEL: Record<WishlistCategory, string> = {
  destination: "Destination",
  attraction: "Attraction",
  restaurant: "Restaurant",
  cafe: "Cafe",
  museum: "Museum",
  hotel: "Hotel",
  neighborhood: "Neighborhood",
  outdoor: "Outdoor",
  experience: "Experience",
  custom: "Custom idea",
};

export function ReelImportPanel({
  collectionId,
  onSaved,
}: {
  collectionId?: string | null;
  onSaved: (items: WishlistItem[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReelPlaceCandidate[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    if (!url.trim() && !text.trim() && !image) {
      setError("Paste a reel link, caption, or screenshot first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setCandidates([]);
    try {
      const res = await fetch("/api/wishlist/from-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || null,
          text: text.trim() || null,
          image,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        places?: ReelPlaceCandidate[];
        notice?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not read that reel");
      const places = data.places ?? [];
      setCandidates(places);
      setSelected(
        Object.fromEntries(places.map((_, i) => [i, true])) as Record<
          number,
          boolean
        >,
      );
      setNotice(data.notice ?? null);
      if (!places.length && !data.notice) {
        setNotice("No places found yet — try pasting more caption text.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that reel");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected() {
    const picks = candidates.filter((_, i) => selected[i]);
    if (!picks.length) return;
    setSaving(true);
    setError(null);
    try {
      const saved: WishlistItem[] = [];
      for (const place of picks) {
        const item = await saveWishlistItem({
          name: place.name,
          location: place.location,
          category: place.category,
          notes: place.notes,
          sourceUrl: place.sourceUrl,
          priority: "medium",
          collectionId: collectionId ?? null,
        });
        saved.push(item);
      }
      onSaved(saved);
      setCandidates([]);
      setSelected({});
      setText("");
      setUrl("");
      setImage(null);
      setNotice(
        `Saved ${saved.length} place${saved.length === 1 ? "" : "s"} to your wishlist.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function onFile(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0400FF]">
            Quick add
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-[#080B3A]">
            From a Reel
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#6B7280]">
            Paste an Instagram, TikTok, or Shorts link — and the caption or a
            screenshot — then pick which places to save. You choose what to
            import; nothing is scraped in the background.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/… or TikTok link"
          className="w-full rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3.5 py-2.5 text-sm text-[#080B3A] outline-none focus:border-[#0400FF] focus:bg-white"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Paste the caption, on-screen place names, or anything the reel mentions…"
          className="w-full resize-none rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3.5 py-2.5 text-sm leading-relaxed text-[#080B3A] outline-none focus:border-[#0400FF] focus:bg-white"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
          >
            {image ? "Change screenshot" : "Add screenshot"}
          </Button>
          {image ? (
            <button
              type="button"
              className="text-xs font-medium text-[#6B7280] hover:text-[#B91C1C]"
              onClick={() => setImage(null)}
            >
              Remove image
            </button>
          ) : (
            <span className="text-xs text-[#9CA3AF]">
              Optional — helps when place names are on screen
            </span>
          )}
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="max-h-40 rounded-[12px] border border-[#E1E5F0] object-contain"
          />
        ) : null}
        <Button
          type="button"
          disabled={busy}
          onClick={() => void analyze()}
        >
          {busy ? "Reading…" : "Find places"}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[#B91C1C]">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-sm text-[#6B7280]">{notice}</p>
      ) : null}

      {candidates.length ? (
        <div className="mt-5 border-t border-[#F0F2F8] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#080B3A]">
              Choose what to save
            </p>
            <Button
              type="button"
              disabled={saving || !Object.values(selected).some(Boolean)}
              onClick={() => void saveSelected()}
            >
              {saving ? "Saving…" : "Add to wishlist"}
            </Button>
          </div>
          <ul className="mt-3 space-y-2">
            {candidates.map((place, index) => (
              <li key={`${place.name}-${index}`}>
                <label className="flex cursor-pointer gap-3 rounded-[12px] bg-[#FAFBFF] px-3 py-2.5 hover:bg-[#F5F7FF]">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#0400FF]"
                    checked={Boolean(selected[index])}
                    onChange={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [index]: !prev[index],
                      }))
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[#080B3A]">
                      {place.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#6B7280]">
                      {[
                        CATEGORY_LABEL[place.category],
                        place.location,
                        place.confidence === "low" ? "needs review" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {place.notes ? (
                      <span className="mt-1 block text-xs text-[#9CA3AF]">
                        {place.notes}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
