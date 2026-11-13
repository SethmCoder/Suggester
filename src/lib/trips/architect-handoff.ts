import type { NightAllocationResult } from "@/lib/trips/night-allocation";

/** Build CreateTripWizard deep-link from Trip Architect state. */
export function buildArchitectWizardHref(input: {
  allocation: NightAllocationResult;
  startDate: string;
  endDate: string;
  travelers: number;
  pace: string;
  interests: string[];
  mustSee: string[];
  idea: string;
  confirmationPaste?: string;
  budget?: number | null;
}): string {
  const destination = input.allocation.cities.map((c) => c.city).join(" → ");
  const params = new URLSearchParams({
    wizard: "1",
    destination,
    startDate: input.startDate,
    endDate: input.endDate,
    travelers: String(input.travelers),
    intensity: input.pace,
    interests: input.interests.join(","),
    mustSee: input.mustSee.slice(0, 12).join("|"),
    idealTrip: input.idea.slice(0, 400),
    legs: JSON.stringify(
      input.allocation.cities.map((c) => ({
        city: c.city,
        nights: c.nights,
        days: c.nights + 1,
      })),
    ),
  });
  if (input.confirmationPaste?.trim()) {
    params.set(
      "confirmationPaste",
      input.confirmationPaste.trim().slice(0, 4000),
    );
  }
  if (input.budget != null) params.set("budget", String(input.budget));
  return `/trips/new?${params.toString()}`;
}
