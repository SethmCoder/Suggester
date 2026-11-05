/** Questions the planner still needs before it builds a personal itinerary. */

export type ClarifyQuestion = {
  id: string;
  prompt: string;
};

export type ClarifyInput = {
  destination: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  budget?: number | null;
  interests: string[];
  intensity?: string;
  transport?: string;
  dietary?: string;
  accessibility?: string;
  mustSee?: string[];
  avoid?: string[];
  idealTrip?: string;
  cities?: string[];
};

export function fallbackClarifyQuestions(input: ClarifyInput): ClarifyQuestion[] {
  const questions: ClarifyQuestion[] = [];
  const interests = input.interests.map((i) => i.toLowerCase());
  const cities = (input.cities ?? []).filter(Boolean);

  if (!input.dietary?.trim()) {
    questions.push({
      id: "food",
      prompt:
        "Any foods you want to skip, or a meal you do not want the days built around?",
    });
  }
  if ((input.travelers ?? 1) > 1) {
    questions.push({
      id: "party",
      prompt:
        "Who is traveling with you — kids, older adults, or anyone who needs a slower pace or step-free routes?",
    });
  } else {
    questions.push({
      id: "party",
      prompt: "Are you traveling solo, or should the days leave room for someone else?",
    });
  }
  if (!input.budget) {
    questions.push({
      id: "spend",
      prompt:
        "How do you want to spend on this trip: mostly free sights, a few paid tickets, or splurge meals and experiences?",
    });
  }
  if (interests.includes("food")) {
    questions.push({
      id: "meals",
      prompt: "Do you want sit-down meals on the plan, or quick bites between sights?",
    });
  }
  if (cities.length > 1) {
    questions.push({
      id: "city-pace",
      prompt: `Which city should feel more relaxed — ${cities.join(" or ")} — and which one should be the busier sightseeing day?`,
    });
  }
  if (!input.idealTrip?.trim() && !input.mustSee?.length) {
    questions.push({
      id: "purpose",
      prompt:
        "What would make this trip feel personal — a celebration, a reunion, a first visit, or something you want to avoid repeating from past trips?",
    });
  }
  if (!input.accessibility?.trim()) {
    questions.push({
      id: "limits",
      prompt:
        "Anything the schedule should protect: early nights, long walks you want to skip, rain backup, or a fixed reservation already booked?",
    });
  }
  if (input.intensity === "packed") {
    questions.push({
      id: "anchor",
      prompt:
        "On a packed day, which one stop should never get cut if time runs short?",
    });
  }

  const seen = new Set<string>();
  return questions.filter((q) => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  }).slice(0, 5);
}
