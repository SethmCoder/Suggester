"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatTripDate } from "@/lib/format-date";
import { addCalendarDays } from "@/lib/trips/dates";
import { stopColorForIndex, stopColorForKey } from "@/lib/trips/stop-colors";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { getPreferredLanguageClient } from "@/lib/i18n/preference";
import { HotelChoice } from "@/components/trips/HotelChoice";
import { bookedHotelForDay, legForDay, } from "@/lib/trips/calendar-hotel";
import { LockedTimedStopForm, } from "./LockedTimedStopForm";
import { calendarStopFromLockedInput } from "@/lib/trips/locked-stop";
function categoryLabel(category) {
    if (!category || category === "other")
        return "";
    return category.replace(/_/g, " ");
}
const HOUR_START = 8;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const HOUR_PX = 36;
const MAX_VISIBLE_DAYS = 3;
function clockMinutes(value) {
    if (!value)
        return null;
    const [h, m] = value.slice(0, 5).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m))
        return null;
    return h * 60 + m;
}
function formatClock(totalMinutes) {
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function minutesToTime(totalMinutes) {
    return `${formatClock(totalMinutes)}:00`;
}
function snapMinutes(raw, step = 15) {
    const clamped = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 + 60, raw));
    return Math.round(clamped / step) * step;
}
function yToMinutes(y, top) {
    const rel = y - top;
    const hoursFromStart = rel / HOUR_PX;
    return snapMinutes((HOUR_START + hoursFromStart) * 60);
}
function activityTop(activity) {
    const start = clockMinutes(activity.start_time);
    if (start == null)
        return null;
    return ((start - HOUR_START * 60) / 60) * HOUR_PX;
}
function activityHeight(activity) {
    const start = clockMinutes(activity.start_time) ?? HOUR_START * 60;
    const endClock = clockMinutes(activity.end_time);
    const end = endClock != null && endClock > start
        ? endClock
        : start + (activity.duration_minutes ?? 60);
    const px = ((end - start) / 60) * HOUR_PX;
    return Math.max(24, px);
}
function findHereSearchQuery(city, startMinutes) {
    if (startMinutes < 11 * 60) {
        return `things to do museum attraction park ${city}`;
    }
    if (startMinutes < 14 * 60) {
        return `things to do attraction museum historic ${city}`;
    }
    if (startMinutes < 17 * 60) {
        return `things to do museum attraction viewpoint ${city}`;
    }
    if (startMinutes < 20 * 60) {
        return `things to do attraction restaurant shopping ${city}`;
    }
    return `things to do entertainment restaurant ${city}`;
}
export function WeekCalendarView({ days, startDate, dayCities, legs, onAddStop, onSelectActivity, onUpdateLeg, }) {
    const { t, language } = useLanguage();
    const [weekStart, setWeekStart] = useState(0);
    const [draft, setDraft] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [mode, setMode] = useState("find");
    const [name, setName] = useState("");
    const [note, setNote] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [picked, setPicked] = useState(null);
    const [composerKind, setComposerKind] = useState("place");
    const [lockedDayIndex, setLockedDayIndex] = useState(0);
    const [lockedFormOpen, setLockedFormOpen] = useState(false);
    const [hotelSuggestLeg, setHotelSuggestLeg] = useState(null);
    const [hotelBrand, setHotelBrand] = useState("");
    const [hotelMinRating, setHotelMinRating] = useState(4);
    const [hotelPlace, setHotelPlace] = useState("any");
    const gridRef = useRef(null);
    const dragOrigin = useRef(null);
    const visibleDays = useMemo(() => days.slice(weekStart, weekStart + MAX_VISIBLE_DAYS), [days, weekStart]);
    const canPrev = weekStart > 0;
    const canNext = weekStart + MAX_VISIBLE_DAYS < days.length;
    const gridHeight = HOURS.length * HOUR_PX;
    function closeComposer() {
        setDraft(null);
        setDragging(null);
        setComposerKind("place");
        setMode("find");
        setName("");
        setNote("");
        setSearchQuery("");
        setSearchResults([]);
        setAiSuggestions([]);
        setPicked(null);
        dragOrigin.current = null;
    }
    function beginDrag(dayIndex, clientY, columnTop) {
        const minutes = yToMinutes(clientY, columnTop);
        dragOrigin.current = { dayIndex, minutes };
        setDragging({
            dayIndex,
            startMinutes: minutes,
            endMinutes: minutes + 60,
        });
        setDraft(null);
        setMode("find");
        setAiSuggestions([]);
        setPicked(null);
    }
    function moveDrag(clientY, columnTop) {
        if (!dragOrigin.current)
            return;
        const minutes = yToMinutes(clientY, columnTop);
        const start = Math.min(dragOrigin.current.minutes, minutes);
        const end = Math.max(dragOrigin.current.minutes + 15, minutes);
        setDragging({
            dayIndex: dragOrigin.current.dayIndex,
            startMinutes: start,
            endMinutes: Math.max(start + 15, end),
        });
    }
    function endDrag() {
        if (!dragging) {
            dragOrigin.current = null;
            return;
        }
        const start = Math.min(dragging.startMinutes, dragging.endMinutes);
        const end = Math.max(dragging.startMinutes, dragging.endMinutes);
        setDraft({
            dayIndex: dragging.dayIndex,
            startMinutes: start,
            endMinutes: Math.max(start + 30, end),
        });
        setDragging(null);
        setMode("find");
        setName("");
        setNote("");
        setSearchQuery("");
        setSearchResults([]);
        setAiSuggestions([]);
        setPicked(null);
        dragOrigin.current = null;
    }
    const draftNear = useMemo(() => {
        if (!draft)
            return null;
        const leg = dayCities?.[draft.dayIndex];
        if (leg?.anchorLat != null &&
            leg.anchorLng != null &&
            Number.isFinite(leg.anchorLat) &&
            Number.isFinite(leg.anchorLng) &&
            (leg.anchorLat !== 0 || leg.anchorLng !== 0)) {
            return { lat: leg.anchorLat, lng: leg.anchorLng };
        }
        const hit = days[draft.dayIndex]?.activities.find((a) => a.lat != null && a.lng != null);
        if (hit?.lat == null || hit.lng == null)
            return null;
        return { lat: hit.lat, lng: hit.lng };
    }, [draft, days, dayCities]);
    useEffect(() => {
        if (!draft || mode !== "manual") {
            setSearchResults([]);
            return;
        }
        const q = searchQuery.trim();
        if (q.length < 2) {
            setSearchResults([]);
            return;
        }
        const timer = window.setTimeout(() => {
            const params = new URLSearchParams({ q, limit: "6" });
            if (draftNear) {
                params.set("lat", String(draftNear.lat));
                params.set("lng", String(draftNear.lng));
            }
            void fetch(`/api/places/search?${params}`)
                .then((res) => res.json())
                .then((data) => setSearchResults(data.results ?? []))
                .catch(() => setSearchResults([]));
        }, 280);
        return () => window.clearTimeout(timer);
    }, [draft, mode, searchQuery, draftNear]);
    async function runFindHere() {
        if (!draft)
            return;
        setAiBusy(true);
        setAiSuggestions([]);
        try {
            const city = dayCities?.[draft.dayIndex]?.city ||
                days[draft.dayIndex]?.city ||
                "";
            const params = new URLSearchParams({
                limit: "6",
                startMinutes: String(draft.startMinutes),
                lang: language || getPreferredLanguageClient(),
            });
            if (city)
                params.set("city", city);
            if (draftNear) {
                params.set("lat", String(draftNear.lat));
                params.set("lng", String(draftNear.lng));
            }
            const res = await fetch(`/api/places/slot-suggest?${params}`);
            const data = (await res.json());
            let hits = (data.results ?? []).filter((hit) => hit.name);
            // Fallback: plain place search around the slot if OSM returned nothing.
            if (!hits.length && city) {
                const fallback = new URLSearchParams({
                    q: findHereSearchQuery(city, draft.startMinutes),
                    limit: "6",
                    lang: language || getPreferredLanguageClient(),
                });
                if (draftNear) {
                    fallback.set("lat", String(draftNear.lat));
                    fallback.set("lng", String(draftNear.lng));
                }
                const fbRes = await fetch(`/api/places/search?${fallback}`);
                const fbData = (await fbRes.json());
                hits = (fbData.results ?? []).filter((hit) => hit.name);
            }
            setAiSuggestions(hits);
            if (hits[0]) {
                setPicked(hits[0]);
                setName(hits[0].name);
                setNote(`${formatClock(draft.startMinutes)}–${formatClock(draft.endMinutes)}${city ? ` · ${city}` : ""}`);
            }
            else {
                setNote(data.notice || t("calendar.noMatch"));
            }
        }
        catch {
            setNote(t("calendar.couldNotFind"));
        }
        finally {
            setAiBusy(false);
        }
    }
    // Auto-suggest as soon as a slot is dragged open.
    useEffect(() => {
        if (!draft || composerKind !== "place")
            return;
        void runFindHere();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new draft opens
    }, [draft?.dayIndex, draft?.startMinutes, draft?.endMinutes, composerKind]);
    function pickPlace(hit, fromAi) {
        setPicked(hit);
        setName(hit.name);
        if (fromAi) {
            setNote((current) => current ||
                `Suggested for ${formatClock(draft.startMinutes)}–${formatClock(draft.endMinutes)}`);
        }
        setSearchQuery("");
        setSearchResults([]);
    }
    async function saveDraft() {
        if (!draft)
            return;
        const title = name.trim() || picked?.name || "New stop";
        setBusy(true);
        try {
            await onAddStop({
                dayIndex: draft.dayIndex,
                name: title,
                note: note.trim() || undefined,
                startTime: minutesToTime(draft.startMinutes),
                durationMinutes: Math.max(15, draft.endMinutes - draft.startMinutes),
                address: picked?.address,
                lat: picked?.lat,
                lng: picked?.lng,
                useAi: mode === "find" && Boolean(picked),
            });
            closeComposer();
        }
        finally {
            setBusy(false);
        }
    }
    const activeSlot = draft ?? dragging;
    async function saveLockedStop(input, dayIndex) {
        setBusy(true);
        try {
            await onAddStop(calendarStopFromLockedInput(dayIndex, input));
            setLockedFormOpen(false);
            closeComposer();
        }
        finally {
            setBusy(false);
        }
    }
    const suggestLeg = hotelSuggestLeg != null ? legs?.[hotelSuggestLeg] : undefined;
    return (React.createElement("div", { className: "overflow-hidden rounded-[14px] border border-[#E1E5F0] bg-white shadow-[0_2px_12px_rgba(8,11,58,0.04)]" },
        React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-2 border-b border-[#E1E5F0] px-4 py-3" },
            React.createElement("div", null,
                React.createElement("h2", { className: "text-sm font-semibold text-[#080B3A]" }, t("calendar.title")),
                React.createElement("p", { className: "text-xs text-[#6B7280]" }, t("calendar.hint"))),
            React.createElement("button", { type: "button", onClick: () => {
                    setLockedDayIndex(weekStart);
                    setLockedFormOpen(true);
                }, className: "rounded-[10px] border border-[#0400FF]/35 bg-white px-2.5 py-1 text-xs font-semibold text-[#0400FF] hover:bg-[#EEF1FF]" }, "Meeting / transport"),
            days.length > MAX_VISIBLE_DAYS ? (React.createElement("div", { className: "flex items-center gap-2" },
                React.createElement("button", { type: "button", disabled: !canPrev, onClick: () => setWeekStart((s) => Math.max(0, s - MAX_VISIBLE_DAYS)), className: "rounded-[10px] border border-[#E1E5F0] px-2.5 py-1 text-xs font-semibold text-[#080B3A] disabled:opacity-40" }, t("calendar.earlier")),
                React.createElement("span", { className: "text-xs text-[#6B7280]" },
                    t("calendar.days"),
                    " ",
                    weekStart + 1,
                    "\u2013",
                    Math.min(days.length, weekStart + MAX_VISIBLE_DAYS)),
                React.createElement("button", { type: "button", disabled: !canNext, onClick: () => setWeekStart((s) => Math.min(Math.max(0, days.length - MAX_VISIBLE_DAYS), s + MAX_VISIBLE_DAYS)), className: "rounded-[10px] border border-[#E1E5F0] px-2.5 py-1 text-xs font-semibold text-[#080B3A] disabled:opacity-40" }, t("calendar.later")))) : null),
        React.createElement("div", { className: "overflow-x-auto" },
            React.createElement("div", { ref: gridRef, className: "grid min-w-[720px]", style: {
                    gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr)) 52px`,
                } },
                visibleDays.map((day) => {
                    const dateIso = startDate
                        ? addCalendarDays(startDate, day.dayIndex)
                        : null;
                    return (React.createElement("div", { key: day.dayId, className: "border-r border-[#E1E5F0] px-2 py-2 text-center" },
                        React.createElement("p", { className: "text-xs font-semibold text-[#080B3A]" }, day.label),
                        React.createElement("p", { className: "text-[11px] text-[#6B7280]" }, dateIso ? formatTripDate(dateIso, "short") : day.dateLabel),
                        day.city || dayCities?.[day.dayIndex]?.city ? (React.createElement("p", { className: "truncate text-[10px] text-[#0400FF]" }, day.city || dayCities?.[day.dayIndex]?.city)) : null));
                }),
                React.createElement("div", { className: "px-1 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]" }, "Time"),
                visibleDays.map((day) => {
                    const booked = bookedHotelForDay({
                        dayIndex: day.dayIndex,
                        dayCities,
                        legs,
                        activities: day.activities,
                    });
                    const legPair = legForDay(day.dayIndex, dayCities, legs);
                    return (React.createElement("div", { key: `${day.dayId}-hotel`, className: "flex min-h-[44px] flex-col justify-center border-r border-[#E1E5F0] bg-[#F5F7FF] px-2 py-1.5" }, booked ? (React.createElement("p", { className: "truncate rounded-[8px] bg-[#080B3A] px-2 py-1 text-center text-[10px] font-semibold text-white", title: booked.name }, booked.name)) : legPair?.leg.city ? (React.createElement("button", { type: "button", onClick: () => {
                            setHotelSuggestLeg(legPair.legIndex);
                            setHotelBrand(legPair.leg.hotelBrand ?? "");
                            setHotelMinRating(legPair.leg.hotelMinRating ?? 4);
                            setHotelPlace(legPair.leg.hotelPlace ?? "any");
                        }, className: "w-full rounded-[8px] border border-dashed border-[#0400FF]/50 bg-white px-1.5 py-1 text-[10px] font-semibold text-[#0400FF] hover:bg-[#EEF1FF]" }, "Suggest a hotel brand")) : null));
                }),
                React.createElement("div", { className: "min-h-[44px] border-[#E1E5F0] bg-[#F5F7FF]", "aria-hidden": true }),
                visibleDays.map((day) => (React.createElement("div", { key: `${day.dayId}-grid`, className: "relative select-none border-r border-[#E1E5F0] bg-[#FAFBFF]", style: { height: gridHeight }, onPointerDown: (e) => {
                        if (e.target.closest("[data-activity]"))
                            return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        beginDrag(day.dayIndex, e.clientY, rect.top);
                    }, onPointerMove: (e) => {
                        if (!dragOrigin.current)
                            return;
                        if (dragOrigin.current.dayIndex !== day.dayIndex)
                            return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        moveDrag(e.clientY, rect.top);
                    }, onPointerUp: () => endDrag(), onPointerCancel: () => {
                        setDragging(null);
                        dragOrigin.current = null;
                    } },
                    HOURS.map((hour) => (React.createElement("div", { key: hour, className: "pointer-events-none border-b border-[#E8ECF5]", style: { height: HOUR_PX } }))),
                    day.activities.map((activity) => {
                        const top = activityTop(activity);
                        if (top == null)
                            return null;
                        const color = day.city
                            ? stopColorForKey(day.city)
                            : stopColorForIndex(day.dayIndex);
                        return (React.createElement("button", { key: activity.id, type: "button", "data-activity": true, onClick: () => onSelectActivity?.(day.dayIndex, activity.id), className: "absolute left-1 right-1 z-[1] overflow-hidden rounded-[8px] px-1.5 py-1 text-left text-[10px] font-medium shadow-sm", style: {
                                top,
                                height: activityHeight(activity),
                                background: color.solid,
                                border: `1px solid ${color.border}`,
                                color: color.text,
                            }, title: activity.name },
                            React.createElement("span", { className: "block truncate" }, activity.name),
                            React.createElement("span", { className: "block opacity-80" },
                                (activity.start_time ?? "").slice(0, 5),
                                activity.duration_minutes
                                    ? ` · ${activity.duration_minutes}m`
                                    : "")));
                    }),
                    activeSlot && activeSlot.dayIndex === day.dayIndex ? (React.createElement("div", { className: "pointer-events-none absolute left-1 right-1 z-[2] rounded-[8px] border-2 border-dashed border-[#0400FF] bg-[#0400FF]/15", style: {
                            top: ((Math.min(activeSlot.startMinutes, activeSlot.endMinutes) -
                                HOUR_START * 60) /
                                60) *
                                HOUR_PX,
                            height: Math.max(24, ((Math.abs(activeSlot.endMinutes - activeSlot.startMinutes) || 60) /
                                60) *
                                HOUR_PX),
                        } })) : null))),
                React.createElement("div", { className: "relative bg-white", style: { height: gridHeight }, "aria-hidden": true }, HOURS.map((hour) => (React.createElement("div", { key: hour, className: "flex items-start justify-end border-b border-transparent pr-2 text-[10px] font-medium text-[#6B7280]", style: { height: HOUR_PX } }, `${String(hour).padStart(2, "0")}:00`)))))),
        draft ? (React.createElement("div", { className: "fixed inset-0 z-[80] flex items-end justify-center bg-[#080B3A]/35 p-4 sm:items-center", role: "dialog", "aria-modal": "true", "aria-label": "Add a stop", onClick: closeComposer },
            React.createElement("div", { className: "w-full max-w-md rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_16px_48px_rgba(8,11,58,0.22)]", onClick: (e) => e.stopPropagation() },
                React.createElement("div", { className: "flex items-start justify-between gap-3" },
                    React.createElement("div", null,
                        React.createElement("p", { className: "text-sm font-semibold text-[#080B3A]" },
                            "Day ",
                            draft.dayIndex + 1,
                            " \u00B7",
                            " ",
                            formatClock(draft.startMinutes),
                            "\u2013",
                            formatClock(draft.endMinutes)),
                        React.createElement("p", { className: "mt-0.5 text-xs text-[#6B7280]" }, dayCities?.[draft.dayIndex]?.city ||
                            days[draft.dayIndex]?.city ||
                            "Add something in this time slot")),
                    React.createElement("button", { type: "button", className: "text-xs font-semibold text-[#6B7280]", onClick: closeComposer }, t("calendar.close"))),
                React.createElement("div", { className: "mt-4" },
                    React.createElement("div", { className: "relative grid grid-cols-3 rounded-full bg-[#EEF1F8] p-1 text-xs font-semibold", role: "tablist", "aria-label": "Stop type" },
                        React.createElement("span", { "aria-hidden": true, className: "pointer-events-none absolute bottom-1 top-1 w-[calc(33.333%-4px)] rounded-full bg-white shadow-sm transition-all duration-200", style: {
                                left: composerKind === "place"
                                    ? "4px"
                                    : composerKind === "meeting"
                                        ? "calc(33.333% + 2px)"
                                        : "calc(66.666% - 2px)",
                            } }),
                        [
                            ["place", "Place"],
                            ["meeting", "Meeting"],
                            ["transport", "Transport"],
                        ].map(([kind, label]) => (React.createElement("button", { key: kind, type: "button", role: "tab", "aria-selected": composerKind === kind, className: `relative z-[1] rounded-full px-2 py-2 transition-colors ${composerKind === kind ? "text-[#080B3A]" : "text-[#6B7280]"}`, onClick: () => setComposerKind(kind) }, label))))),
                composerKind !== "place" ? (React.createElement(LockedTimedStopForm, { dayLabel: `Day ${draft.dayIndex + 1}`, defaultStart: formatClock(draft.startMinutes), defaultEnd: formatClock(draft.endMinutes), busy: busy, onSubmit: (input) => void saveLockedStop(input, draft.dayIndex), onCancel: closeComposer })) : (React.createElement(React.Fragment, null,
                    React.createElement(Button, { type: "button", className: "mt-4 w-full", disabled: aiBusy, onClick: () => {
                            setMode("find");
                            void runFindHere();
                        } }, aiBusy ? t("calendar.looking") : t("calendar.findHere")),
                    React.createElement("div", { className: "mt-4" },
                        React.createElement("div", { className: "relative grid grid-cols-2 rounded-full bg-[#EEF1F8] p-1 text-xs font-semibold", role: "tablist", "aria-label": "How to add this stop" },
                            React.createElement("span", { "aria-hidden": true, className: "pointer-events-none absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-all duration-200", style: {
                                    left: mode === "manual" ? "calc(50% + 2px)" : "4px",
                                } }),
                            React.createElement("button", { type: "button", role: "tab", "aria-selected": mode === "find", className: `relative z-[1] rounded-full px-3 py-2 transition-colors ${mode === "find" ? "text-[#080B3A]" : "text-[#6B7280]"}`, onClick: () => setMode("find") }, t("calendar.findForMe")),
                            React.createElement("button", { type: "button", role: "tab", "aria-selected": mode === "manual", className: `relative z-[1] rounded-full px-3 py-2 transition-colors ${mode === "manual" ? "text-[#080B3A]" : "text-[#6B7280]"}`, onClick: () => setMode("manual") }, t("calendar.manual")))),
                    mode === "find" ? (React.createElement("div", { className: "mt-4 space-y-3" },
                        React.createElement("p", { className: "text-xs text-[#6B7280]" }, t("calendar.findHint")),
                        aiSuggestions.length ? (React.createElement("ul", { className: "max-h-44 space-y-1 overflow-auto rounded-[12px] border border-[#E1E5F0]" }, aiSuggestions.map((hit) => (React.createElement("li", { key: hit.id },
                            React.createElement("button", { type: "button", className: `w-full px-3 py-2 text-left text-sm hover:bg-[#F5F7FF] ${picked?.id === hit.id ? "bg-[#EEF1FF]" : ""}`, onClick: () => pickPlace(hit, true) },
                                React.createElement("span", { className: "font-medium text-[#080B3A]" },
                                    hit.name,
                                    categoryLabel(hit.category) ? (React.createElement("span", { className: "ml-2 text-[10px] font-semibold uppercase tracking-wide text-[#0400FF]" }, categoryLabel(hit.category))) : null),
                                React.createElement("span", { className: "mt-0.5 block truncate text-[11px] text-[#6B7280]" }, hit.address))))))) : null,
                        picked ? (React.createElement("p", { className: "rounded-[10px] bg-[#F5F7FF] px-3 py-2 text-xs text-[#080B3A]" },
                            t("calendar.selected"),
                            ":",
                            " ",
                            React.createElement("span", { className: "font-semibold" }, picked.name))) : null,
                        note && !aiSuggestions.length ? (React.createElement("p", { className: "text-xs text-[#6B7280]" }, note)) : null)) : (React.createElement("div", { className: "mt-4 space-y-3" },
                        React.createElement("div", { className: "relative" },
                            React.createElement(Label, null, t("calendar.searchPlaces")),
                            React.createElement(Input, { value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Cafe, museum, park\u2026", autoFocus: true, autoComplete: "off" }),
                            searchResults.length ? (React.createElement("ul", { className: "absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-[10px] border border-[#E1E5F0] bg-white shadow-lg" }, searchResults.map((hit) => (React.createElement("li", { key: hit.id },
                                React.createElement("button", { type: "button", className: "w-full px-3 py-2 text-left text-sm hover:bg-[#DDE1FF]", onClick: () => pickPlace(hit, false) },
                                    React.createElement("span", { className: "font-medium text-[#080B3A]" }, hit.name),
                                    React.createElement("span", { className: "mt-0.5 block truncate text-[11px] text-[#6B7280]" }, hit.address))))))) : null),
                        React.createElement("div", null,
                            React.createElement(Label, null, t("calendar.placeName")),
                            React.createElement(Input, { value: name, onChange: (e) => {
                                    setName(e.target.value);
                                    if (picked && e.target.value !== picked.name) {
                                        setPicked(null);
                                    }
                                }, placeholder: "Or type a custom stop name" })),
                        React.createElement("div", null,
                            React.createElement(Label, null, t("calendar.note")),
                            React.createElement(Input, { value: note, onChange: (e) => setNote(e.target.value), placeholder: "Optional detail" })))),
                    React.createElement("div", { className: "mt-4 flex flex-wrap gap-2" },
                        React.createElement(Button, { type: "button", disabled: busy || (!name.trim() && !picked), onClick: () => void saveDraft() }, busy ? "…" : t("calendar.addStop")),
                        React.createElement(Button, { type: "button", variant: "ghost", onClick: closeComposer }, "Cancel"))))))) : null,
        lockedFormOpen ? (React.createElement("div", { className: "fixed inset-0 z-[80] flex items-end justify-center bg-[#080B3A]/35 p-4 sm:items-center", role: "dialog", "aria-modal": "true", "aria-label": "Add meeting or transport", onClick: () => setLockedFormOpen(false) },
            React.createElement("div", { className: "w-full max-w-md rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_16px_48px_rgba(8,11,58,0.22)]", onClick: (e) => e.stopPropagation() },
                React.createElement("p", { className: "text-sm font-semibold text-[#080B3A]" },
                    "Locked stop \u00B7 Day ",
                    lockedDayIndex + 1),
                days.length > 1 ? (React.createElement("div", { className: "mt-2" },
                    React.createElement(Label, null, "Day"),
                    React.createElement("select", { value: lockedDayIndex, onChange: (e) => setLockedDayIndex(Number(e.target.value)), className: "mt-1 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm" }, days.map((d) => (React.createElement("option", { key: d.dayId, value: d.dayIndex },
                        "Day ",
                        d.dayIndex + 1,
                        d.city ? ` · ${d.city}` : "")))))) : null,
                React.createElement("div", { className: "mt-3" },
                    React.createElement(LockedTimedStopForm, { busy: busy, onSubmit: (input) => void saveLockedStop(input, lockedDayIndex), onCancel: () => setLockedFormOpen(false) }))))) : null,
        hotelSuggestLeg != null && suggestLeg?.city && onUpdateLeg ? (React.createElement("div", { className: "fixed inset-0 z-[80] flex items-end justify-center bg-[#080B3A]/35 p-4 sm:items-center", role: "dialog", "aria-modal": "true", "aria-label": "Suggest a hotel brand", onClick: () => setHotelSuggestLeg(null) },
            React.createElement("div", { className: "max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_16px_48px_rgba(8,11,58,0.22)]", onClick: (e) => e.stopPropagation() },
                React.createElement("div", { className: "flex items-start justify-between gap-2" },
                    React.createElement("div", null,
                        React.createElement("p", { className: "text-sm font-semibold text-[#080B3A]" }, "Suggest a hotel brand"),
                        React.createElement("p", { className: "text-xs text-[#6B7280]" }, suggestLeg.city)),
                    React.createElement("button", { type: "button", className: "text-xs font-semibold text-[#6B7280]", onClick: () => setHotelSuggestLeg(null) }, "Close")),
                React.createElement("div", { className: "mt-4" },
                    React.createElement(HotelChoice, { city: suggestLeg.city, booked: false, minRating: hotelMinRating, place: hotelPlace, brand: hotelBrand, selectedName: suggestLeg.hotel ?? "", onBooked: () => {
                            /* suggestions only */
                        }, onMinRating: setHotelMinRating, onPlace: setHotelPlace, onBrand: setHotelBrand, onClear: () => {
                            onUpdateLeg(hotelSuggestLeg, {
                                hotel: "",
                                hotelAddress: undefined,
                                hotelLat: undefined,
                                hotelLng: undefined,
                                hotelPlaceId: undefined,
                            });
                        }, onPick: (hotel) => {
                            onUpdateLeg(hotelSuggestLeg, {
                                hotel: hotel.name,
                                hotelAddress: hotel.location,
                                hotelBrand: hotelBrand.trim() || undefined,
                                hotelBooked: false,
                                hotelMinRating,
                                hotelPlace,
                                hotelLat: hotel.lat,
                                hotelLng: hotel.lng,
                                hotelPlaceId: hotel.id,
                            });
                            setHotelSuggestLeg(null);
                        } }))))) : null));
}
