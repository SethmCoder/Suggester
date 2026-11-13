"use client";

/** Trip Architect stages: idea → destinations → nights → places → bookings → build */
export type PlannerStage =
  | "dream"
  | "destinations"
  | "decide"
  | "places"
  | "book"
  | "organize";

const STAGES: { id: PlannerStage; label: string; hint: string }[] = [
  { id: "dream", label: "Dream", hint: "Your idea" },
  { id: "destinations", label: "Destinations", hint: "Where to go" },
  { id: "decide", label: "Nights", hint: "How long where" },
  { id: "places", label: "Places", hint: "What to do" },
  { id: "book", label: "Book", hint: "Confirmations" },
  { id: "organize", label: "Organize", hint: "Build plan" },
];

export function PlanningStages({
  current,
  onSelect,
}: {
  current: PlannerStage;
  onSelect?: (stage: PlannerStage) => void;
}) {
  const currentIdx = STAGES.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Trip Architect stages" className="w-full">
      <ol className="flex flex-wrap gap-2">
        {STAGES.map((stage, index) => {
          const done = index < currentIdx;
          const active = stage.id === current;
          return (
            <li key={stage.id}>
              <button
                type="button"
                disabled={!onSelect || index > currentIdx}
                onClick={() => onSelect?.(stage.id)}
                className={`rounded-full px-3 py-1.5 text-left text-xs font-semibold transition ${
                  active
                    ? "bg-[#0400FF] text-white"
                    : done
                      ? "bg-[#DDE1FF] text-[#0400FF]"
                      : "bg-[#F5F7FF] text-[#9299B5]"
                } ${onSelect && index <= currentIdx ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className="block">
                  {index + 1}. {stage.label}
                </span>
                <span
                  className={`block font-normal ${
                    active ? "text-white/80" : "text-[#9299B5]"
                  }`}
                >
                  {stage.hint}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
