import type { ActivityRow } from "@/lib/types/trip";

export type ExportDay = {
  dayIndex: number;
  label?: string;
  dateLabel?: string;
  city?: string;
  activities: ActivityRow[];
};

/** Markdown itinerary for clipboard copy (demo/offline friendly). */
export function itineraryToMarkdown(input: {
  destination: string;
  startDate?: string;
  endDate?: string;
  days: ExportDay[];
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.destination}`);
  if (input.startDate || input.endDate) {
    lines.push(
      [
        input.startDate ?? "",
        input.endDate ? `– ${input.endDate}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  lines.push("");

  for (const day of input.days) {
    const heading = [
      `## Day ${day.dayIndex + 1}`,
      day.dateLabel,
      day.city,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(heading);
    const acts = [...day.activities].sort((a, b) => {
      const sa = a.start_time ?? "";
      const sb = b.start_time ?? "";
      return sa.localeCompare(sb);
    });
    if (!acts.length) {
      lines.push("- (no stops)");
      lines.push("");
      continue;
    }
    for (const a of acts) {
      const time = [a.start_time?.slice(0, 5), a.end_time?.slice(0, 5)]
        .filter(Boolean)
        .join("–");
      const lock = a.user_locked ? " 🔒" : "";
      lines.push(
        `- ${time ? `**${time}** ` : ""}${a.name}${lock}${
          a.address ? ` — ${a.address}` : ""
        }`,
      );
      if (a.planning_note) {
        lines.push(`  - ${a.planning_note}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
