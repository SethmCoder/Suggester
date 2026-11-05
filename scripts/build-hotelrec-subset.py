#!/usr/bin/env python3
"""Build a local HotelRec subset for offline hotel suggestions.

Reads the public HotelRec release (Full_HotelRec.zip → HotelRec.txt) from
https://github.com/diegoantognini/HotelRec via the SWITCH share linked in
that README. The zip is ~14 GB compressed / ~47 GB of JSON lines, so this
script inflates only a byte budget from the start of the deflate stream and
keeps a few real reviews per hotel.

Does not scrape TripAdvisor. Does not generate review text.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import zlib
from collections import defaultdict

DOWNLOAD = "https://drive.switch.ch/index.php/s/n48smsdufhRA7fR/download"
# Local file header + name + extra; deflate payload starts here.
DEFLATE_START = 90
URL_RE = re.compile(r"Hotel_Review-g(\d+)-d(\d+)-Reviews-(.+)\.html$")

BEACH_RE = re.compile(
    r"\b(beach|beaches|seaside|seafront|oceanfront|waterfront|shoreline)\b",
    re.I,
)
CENTER_RE = re.compile(
    r"\b(city cent(?:er|re)|downtown|old town|centrally located|central location|in the cent(?:er|re))\b",
    re.I,
)
SIGHTS_RE = re.compile(
    r"\b(attractions?|landmarks?|sightseeing|walking distance|museums?)\b",
    re.I,
)
TRANSIT_RE = re.compile(
    r"\b(metro|subway|train station|tram|public transport|bus stop|tube station|transit)\b",
    re.I,
)


def parse_hotel_url(url: str) -> tuple[str, str, str] | None:
    match = URL_RE.match(url or "")
    if not match:
        return None
    rest = match.group(3)
    parts = rest.split("-")
    if len(parts) < 2:
        return None
    name = " ".join(part.replace("_", " ") for part in parts[:-1]).strip()
    location = parts[-1].replace("_", " ").strip()
    # "Province of X" reads better with commas between the trailing place names.
    location = re.sub(r"\s+", " ", location)
    if not name or not location:
        return None
    return match.group(2), name, location


def clip(text: str, limit: int = 420) -> str:
    text = re.sub(r"\s+", " ", (text or "").replace("\x00", "")).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return (cut or text[:limit]).rstrip(".,; ") + "…"


class HotelAcc:
    def __init__(self, hotel_id: str, name: str, location: str) -> None:
        self.id = hotel_id
        self.name = name
        self.location = location
        self.n = 0
        self.rating_sum = 0.0
        self.loc_sum = 0.0
        self.loc_n = 0
        self.beach = 0
        self.center = 0
        self.sights = 0
        self.transit = 0
        self.quotes: list[dict] = []

    def add(self, row: dict) -> None:
        self.n += 1
        try:
            rating = float(row.get("rating"))
        except (TypeError, ValueError):
            rating = None
        if rating is not None:
            self.rating_sum += rating
        props = row.get("property_dict") or {}
        loc = props.get("location")
        if isinstance(loc, (int, float)):
            self.loc_sum += float(loc)
            self.loc_n += 1
        title = str(row.get("title") or "")
        text = str(row.get("text") or "")
        blob = f"{title}\n{text}"
        if BEACH_RE.search(blob):
            self.beach += 1
        if CENTER_RE.search(blob):
            self.center += 1
        if SIGHTS_RE.search(blob):
            self.sights += 1
        if TRANSIT_RE.search(blob):
            self.transit += 1
        quote_text = clip(text)
        author = str(row.get("author") or "").strip()
        if len(quote_text) < 40 or not author:
            return
        self.quotes.append(
            {
                "author": author[:80],
                "date": str(row.get("date") or "")[:10],
                "rating": rating,
                "title": clip(title, 140),
                "text": quote_text,
                "_len": len(quote_text),
            }
        )
        if len(self.quotes) > 12:
            self.quotes.sort(key=lambda q: q["_len"], reverse=True)
            self.quotes = self.quotes[:8]

    def finish(self) -> dict | None:
        if self.n < 1 or not self.quotes:
            return None
        self.quotes.sort(key=lambda q: q["_len"], reverse=True)
        seen = set()
        quotes = []
        for quote in self.quotes:
            key = quote["text"][:80]
            if key in seen:
                continue
            seen.add(key)
            quotes.append(
                {
                    "author": quote["author"],
                    "date": quote["date"],
                    "rating": quote["rating"],
                    "title": quote["title"],
                    "text": quote["text"],
                }
            )
            if len(quotes) == 3:
                break
        if not quotes:
            return None
        return {
            "id": self.id,
            "name": self.name,
            "location": self.location,
            "rating": round(self.rating_sum / self.n, 2),
            "n": self.n,
            "locationScore": round(self.loc_sum / self.loc_n, 2) if self.loc_n else None,
            "locationN": self.loc_n,
            "beach": self.beach,
            "center": self.center,
            "sights": self.sights,
            "transit": self.transit,
            "quotes": quotes,
        }


def build(budget: int, out_path: str) -> None:
    req = urllib.request.Request(
        DOWNLOAD,
        headers={
            "Range": f"bytes={DEFLATE_START}-{DEFLATE_START + budget - 1}",
            "User-Agent": "waypoint-hotelrec-subset/1.0",
        },
    )
    print(f"downloading {budget} compressed bytes…", file=sys.stderr)
    with urllib.request.urlopen(req, timeout=180) as res:
        compressed = res.read()
    print(f"received {len(compressed)} bytes", file=sys.stderr)

    decoder = zlib.decompressobj(-15)
    pending = ""
    hotels: list[dict] = []
    current: HotelAcc | None = None
    current_id = ""
    reviews = 0
    skipped = 0

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        done = current.finish()
        if done:
            hotels.append(done)
        current = None

    blob = decoder.decompress(compressed)
    # Keep a partial trailing line out of the parse.
    text = blob.decode("utf-8", "replace")
    lines = text.split("\n")
    if lines:
        lines = lines[:-1]
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            skipped += 1
            continue
        parsed = parse_hotel_url(row.get("hotel_url", ""))
        if not parsed:
            skipped += 1
            continue
        hotel_id, name, location = parsed
        reviews += 1
        if hotel_id != current_id:
            flush()
            current = HotelAcc(hotel_id, name, location)
            current_id = hotel_id
        assert current is not None
        current.add(row)
        if reviews % 50000 == 0:
            print(
                f"reviews {reviews} hotels {len(hotels)}",
                file=sys.stderr,
            )
    flush()

    by_location: dict[str, int] = defaultdict(int)
    for hotel in hotels:
        by_location[hotel["location"]] += 1

    payload = {
        "dataset": "HotelRec",
        "citation": "Diego Antognini and Boi Faltings. HotelRec: a Novel Very Large-Scale Hotel Recommendation Dataset. LREC 2020.",
        "sourceRepo": "https://github.com/diegoantognini/HotelRec",
        "sourceFile": "Full_HotelRec.zip → HotelRec.txt",
        "licenseNote": "HotelRec is released for academic research. This file is a small aggregated subset of real reviews, not the full 50,264,531-review corpus.",
        "subset": (
            f"Inflated the first {len(compressed)} bytes of the HotelRec.txt "
            "deflate stream (zip local-header offset 90) and kept up to 3 "
            "verbatim review quotes per hotel plus rating totals."
        ),
        "reviewsRead": reviews,
        "rowsSkipped": skipped,
        "hotelCount": len(hotels),
        "locationCount": len(by_location),
        "hotels": hotels,
    }
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    print(
        f"wrote {out_path} hotels={len(hotels)} locations={len(by_location)} reviews={reviews}",
        file=sys.stderr,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bytes", type=int, default=160 * 1024 * 1024)
    parser.add_argument(
        "--out",
        default="data/hotelrec/subset.json",
    )
    args = parser.parse_args()
    build(args.bytes, args.out)


if __name__ == "__main__":
    main()
