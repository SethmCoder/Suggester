"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
export function LockedTimedStopForm({ dayLabel, defaultStart = "09:00", defaultEnd = "10:00", busy, onSubmit, onCancel, }) {
    const [stopKind, setStopKind] = useState("meeting");
    const [title, setTitle] = useState("");
    const [startTime, setStartTime] = useState(defaultStart);
    const [endTime, setEndTime] = useState(defaultEnd);
    const [transportFrom, setTransportFrom] = useState("");
    const [transportTo, setTransportTo] = useState("");
    const canSave = stopKind === "meeting"
        ? title.trim().length > 0
        : transportFrom.trim().length > 0 && transportTo.trim().length > 0;
    return (React.createElement("div", { className: "space-y-3 rounded-[12px] border border-[#DDE1FF] bg-[#FAFBFF] p-3" },
        dayLabel ? (React.createElement("p", { className: "text-xs font-semibold text-[#080B3A]" }, dayLabel)) : null,
        React.createElement("div", null,
            React.createElement(Label, null, "Stop type"),
            React.createElement("select", { value: stopKind, onChange: (e) => setStopKind(e.target.value), className: "mt-1 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm text-[#080B3A] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35" },
                React.createElement("option", { value: "meeting" }, "Meeting"),
                React.createElement("option", { value: "transport" }, "Transport (A\u2192B)"))),
        stopKind === "meeting" ? (React.createElement("div", null,
            React.createElement(Label, null, "Title"),
            React.createElement(Input, { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "Client sync, team standup\u2026" }))) : (React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement(Label, null, "Title (optional)"),
                React.createElement(Input, { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "Taxi to airport" })),
            React.createElement("div", { className: "grid grid-cols-2 gap-2" },
                React.createElement("div", null,
                    React.createElement(Label, null, "From"),
                    React.createElement(Input, { value: transportFrom, onChange: (e) => setTransportFrom(e.target.value), placeholder: "Hotel" })),
                React.createElement("div", null,
                    React.createElement(Label, null, "To"),
                    React.createElement(Input, { value: transportTo, onChange: (e) => setTransportTo(e.target.value), placeholder: "Office" }))))),
        React.createElement("div", { className: "grid grid-cols-2 gap-2" },
            React.createElement("div", null,
                React.createElement(Label, null, "Start"),
                React.createElement(Input, { type: "time", value: startTime, onChange: (e) => setStartTime(e.target.value) })),
            React.createElement("div", null,
                React.createElement(Label, null, "End"),
                React.createElement(Input, { type: "time", value: endTime, onChange: (e) => setEndTime(e.target.value) }))),
        React.createElement("p", { className: "text-[10px] text-[#6B7280]" }, "Locked stops stay on your calendar when the plan refills with AI."),
        React.createElement("div", { className: "flex flex-wrap gap-2" },
            React.createElement(Button, { type: "button", disabled: busy || !canSave, onClick: () => void onSubmit({
                    stopKind,
                    title: title.trim(),
                    startTime,
                    endTime,
                    transportFrom: transportFrom.trim() || undefined,
                    transportTo: transportTo.trim() || undefined,
                }) }, busy ? "…" : "Add locked stop"),
            onCancel ? (React.createElement(Button, { type: "button", variant: "ghost", onClick: onCancel }, "Cancel")) : null)));
}
