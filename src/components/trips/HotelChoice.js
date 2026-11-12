"use client";
import { useEffect, useRef, useState } from "react";
const PLACES = [
    { value: "any", label: "Any" },
    { value: "center", label: "City center" },
    { value: "sights", label: "Sights" },
    { value: "beach", label: "Beach" },
    { value: "transit", label: "Transit" },
];
export function HotelChoice({ city, booked, minRating, place, brand, selectedName, onBooked, onMinRating, onPlace, onBrand, onPick, onClear, onResults, }) {
    const [hotels, setHotels] = useState([]);
    const [citation, setCitation] = useState(null);
    const [openReviews, setOpenReviews] = useState(null);
    const [status, setStatus] = useState("idle");
    const onResultsRef = useRef(onResults);
    const onClearRef = useRef(onClear);
    const selectedRef = useRef(selectedName);
    onResultsRef.current = onResults;
    onClearRef.current = onClear;
    selectedRef.current = selectedName;
    useEffect(() => {
        if (booked || city.trim().length < 2) {
            setHotels([]);
            setStatus("idle");
            onResultsRef.current?.([]);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setStatus("loading");
            const params = new URLSearchParams({
                city: city.trim(),
                minRating: String(minRating),
                place,
            });
            if (brand.trim().length >= 2)
                params.set("brand", brand.trim());
            void fetch(`/api/hotels/suggest?${params}`)
                .then((res) => res.json())
                .then((data) => {
                if (cancelled)
                    return;
                const next = (data.hotels ?? []);
                setHotels(next);
                setCitation(data.citation ?? null);
                setStatus("ready");
                onResultsRef.current?.(next);
                if (selectedRef.current &&
                    !next.some((hotel) => hotel.name === selectedRef.current)) {
                    onClearRef.current?.();
                }
            })
                .catch(() => {
                if (cancelled)
                    return;
                setHotels([]);
                setStatus("ready");
                onResultsRef.current?.([]);
            });
        }, 280);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [booked, city, minRating, place, brand]);
    return (React.createElement("div", { className: "space-y-3" },
        React.createElement("div", { className: "grid grid-cols-2 gap-1 rounded-full bg-[#F5F7FF] p-1" },
            React.createElement("button", { type: "button", className: `rounded-full px-3 py-1.5 text-xs font-semibold ${booked ? "text-[#6B7280]" : "bg-white text-[#080B3A] shadow-sm"}`, onClick: () => onBooked(false) }, "Suggest a hotel"),
            React.createElement("button", { type: "button", className: `rounded-full px-3 py-1.5 text-xs font-semibold ${booked ? "bg-white text-[#080B3A] shadow-sm" : "text-[#6B7280]"}`, onClick: () => onBooked(true) }, "I already booked")),
        booked ? null : (React.createElement("div", { className: "space-y-3" },
            React.createElement("input", { value: brand, onChange: (e) => onBrand(e.target.value), placeholder: "Brand, such as Westin", "aria-label": "Preferred hotel brand", className: "w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35" }),
            React.createElement("div", { className: "flex flex-wrap gap-1.5" }, [3, 4, 4.5].map((rating) => (React.createElement("button", { key: rating, type: "button", className: `rounded-full px-2.5 py-1 text-[11px] font-semibold ${minRating === rating
                    ? "bg-[#0400FF] text-white"
                    : "bg-[#F5F7FF] text-[#0400FF]"}`, onClick: () => onMinRating(rating) },
                rating,
                "+ stars")))),
            React.createElement("div", { className: "flex flex-wrap gap-1.5" }, PLACES.map((item) => (React.createElement("button", { key: item.value, type: "button", className: `rounded-full px-2.5 py-1 text-[11px] font-semibold ${place === item.value
                    ? "bg-[#080B3A] text-white"
                    : "bg-[#F5F7FF] text-[#080B3A]"}`, onClick: () => onPlace(item.value) }, item.label)))),
            status === "loading" ? (React.createElement("p", { className: "text-[11px] text-[#0400FF]" }, "Looking up hotels\u2026")) : null,
            status === "ready" && hotels.length === 0 ? (React.createElement("p", { className: "text-[11px] text-[#6B7280]" }, "No listed hotels match that brand and rating.")) : null,
            React.createElement("ul", { className: "space-y-2" }, hotels.slice(0, 3).map((hotel) => {
                const selected = hotel.name === selectedName;
                const reviewsOpen = openReviews === hotel.id;
                return (React.createElement("li", { key: hotel.id, className: `rounded-[10px] border px-3 py-2 ${selected
                        ? "border-[#0400FF] bg-[#F5F7FF]"
                        : "border-[#E1E5F0] bg-white"}` },
                    React.createElement("p", { className: "text-sm font-semibold text-[#080B3A]" }, hotel.name),
                    React.createElement("p", { className: "text-[11px] text-[#6B7280]" }, hotel.reviewCount > 0
                        ? `${hotel.rating.toFixed(1)} / 5`
                        : hotel.rating > 0
                            ? `${hotel.rating.toFixed(1)} stars`
                            : hotel.location),
                    React.createElement("div", { className: "mt-1.5 flex gap-3" },
                        React.createElement("button", { type: "button", className: "text-[11px] font-semibold text-[#0400FF]", onClick: () => onPick(hotel) }, selected ? "Using this hotel" : "Use this hotel"),
                        hotel.quotes.length ? (React.createElement("button", { type: "button", className: "text-[11px] font-semibold text-[#0400FF]", "aria-expanded": reviewsOpen, onClick: () => setOpenReviews(reviewsOpen ? null : hotel.id) }, "Reviews")) : null),
                    reviewsOpen ? (React.createElement("ul", { className: "mt-2 space-y-2" }, hotel.quotes.map((quote, index) => (React.createElement("li", { key: `${quote.author}-${index}`, className: "rounded-[8px] bg-white px-2 py-1.5" },
                        React.createElement("p", { className: "text-[11px] font-semibold text-[#080B3A]" },
                            quote.author,
                            quote.rating != null ? ` · ${quote.rating}/5` : ""),
                        quote.title ? (React.createElement("p", { className: "text-[12px] font-medium text-[#080B3A]" }, quote.title)) : null,
                        React.createElement("p", { className: "text-[12px] leading-snug text-[#1F2937]" }, quote.text)))))) : null));
            })),
            citation && openReviews ? (React.createElement("p", { className: "text-[10px] leading-snug text-[#6B7280]" },
                "Reviews are real quotes from ",
                citation,
                " Waypoint does not write reviews.")) : null))));
}
