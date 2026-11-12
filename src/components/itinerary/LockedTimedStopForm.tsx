"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export type LockedStopKind = "meeting" | "transport" | "attraction";

export type LockedTimedStopInput = {
  stopKind: LockedStopKind;
  title: string;
  startTime: string;
  endTime: string;
  transportFrom?: string;
  transportTo?: string;
};

export function LockedTimedStopForm({
  dayLabel,
  defaultStart = "09:00",
  defaultEnd = "10:00",
  busy,
  onSubmit,
  onCancel,
}: {
  dayLabel?: string;
  defaultStart?: string;
  defaultEnd?: string;
  busy?: boolean;
  onSubmit: (input: LockedTimedStopInput) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [stopKind, setStopKind] = useState<LockedStopKind>("meeting");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [transportFrom, setTransportFrom] = useState("");
  const [transportTo, setTransportTo] = useState("");

  const canSave =
    stopKind === "transport"
      ? transportFrom.trim().length > 0 && transportTo.trim().length > 0
      : title.trim().length > 0;

  return (
    <div className="space-y-3 rounded-[14px] border border-[#E1E5F0] bg-white p-4 shadow-[0_2px_10px_rgba(8,11,58,0.03)]">
      {dayLabel ? (
        <p className="text-xs font-semibold tracking-wide text-[#6B7280]">
          {dayLabel}
        </p>
      ) : null}
      <div>
        <Label>Stop type</Label>
        <select
          value={stopKind}
          onChange={(e) => {
            const next = e.target.value as LockedStopKind;
            setStopKind(next);
            if (next === "attraction" && endTime === defaultEnd) {
              setEndTime("21:00");
            }
          }}
          className="mt-1 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3 py-2 text-sm text-[#080B3A] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35"
        >
          <option value="meeting">Meeting</option>
          <option value="attraction">Park / attraction day</option>
          <option value="transport">Transport (A→B)</option>
        </select>
      </div>
      {stopKind === "transport" ? (
        <>
          <div>
            <Label>Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Taxi to airport"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>From</Label>
              <Input
                value={transportFrom}
                onChange={(e) => setTransportFrom(e.target.value)}
                placeholder="Hotel"
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                value={transportTo}
                onChange={(e) => setTransportTo(e.target.value)}
                placeholder="Office"
              />
            </div>
          </div>
        </>
      ) : (
        <div>
          <Label>{stopKind === "attraction" ? "Attraction" : "Title"}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              stopKind === "attraction"
                ? "Tokyo Disneyland"
                : "Client sync, team standup…"
            }
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>{stopKind === "attraction" ? "Opens" : "Start"}</Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <Label>{stopKind === "attraction" ? "Closes" : "End"}</Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-[#6B7280]">
        {stopKind === "attraction"
          ? "Uses published open→close times you enter. Stays locked when AI refills the day."
          : "Locked stops stay on your calendar when the plan refills with AI."}
      </p>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button
          type="button"
          disabled={busy || !canSave}
          onClick={() =>
            void onSubmit({
              stopKind,
              title: title.trim(),
              startTime,
              endTime,
              transportFrom: transportFrom.trim() || undefined,
              transportTo: transportTo.trim() || undefined,
            })
          }
        >
          {busy ? "…" : "Add locked stop"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
