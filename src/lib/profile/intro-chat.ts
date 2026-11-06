import type { ClarifyChoice } from "@/lib/trips/clarify-chat";
import type { TravelerProfile } from "@/lib/profile/traveler";

export type IntroLine = { role: "user" | "assistant"; text: string };

export type IntroTurn = {
  reply: string;
  done: boolean;
  choices: ClarifyChoice[];
};

const AGE_MARK = "which age range is closest";
const DREAM_MARK = "closest to your dream vacation";

/**
 * The first two questions are the same for everyone. After that, return null
 * so the model can write the next question from the answers.
 */
export function scriptedIntroTurn(history: IntroLine[], message: string): IntroTurn | null {
  const heard = message.trim();
  if (!history.some((line) => line.role === "assistant" && line.text.toLowerCase().includes(AGE_MARK))) {
    return {
      reply: "Before I plan with you, which age range is closest to you?",
      done: false,
      choices: [
        { id: "u25", label: "Under 25" },
        { id: "25", label: "25–34" },
        { id: "35", label: "35–49" },
        { id: "50", label: "50–64" },
        { id: "65", label: "65 or older" },
      ],
    };
  }
  if (!history.some((line) => line.role === "assistant" && line.text.toLowerCase().includes(DREAM_MARK))) {
    return {
      reply: `${heard ? "Thanks. " : ""}Which of these is closest to your dream vacation?`,
      done: false,
      choices: [
        { id: "small", label: "Small local places, not big restaurants" },
        { id: "sights", label: "Famous sights and a full schedule" },
        { id: "easy", label: "Slow days with time to wander" },
        { id: "outdoors", label: "Outdoors and fewer crowds" },
      ],
    };
  }
  return null;
}

/** Fallback after the shared opening, still a new question each time. */
export function localIntroFollowUp(history: IntroLine[], message: string): IntroTurn {
  const userTurns = history.filter((line) => line.role === "user").length + (message.trim() ? 1 : 0);
  const asked = history
    .filter((line) => line.role === "assistant")
    .map((line) => line.text.toLowerCase())
    .join(" ");
  if (!asked.includes("places have you already liked")) {
    return {
      reply: "Which kinds of places have you already liked?",
      done: false,
      choices: [
        { id: "cities", label: "Big cities" },
        { id: "towns", label: "Small towns" },
        { id: "coast", label: "Beaches or the coast" },
        { id: "mountains", label: "Mountains or the outdoors" },
      ],
    };
  }
  if (!asked.includes("what should a plan avoid") && userTurns < 4) {
    return {
      reply: "What should a plan avoid for you?",
      done: false,
      choices: [
        { id: "packed", label: "Days that are packed solid" },
        { id: "fancy", label: "Fancy meals and big restaurants" },
        { id: "tickets", label: "Expensive tickets" },
        { id: "early", label: "Very early starts" },
      ],
    };
  }
  return {
    reply: "I'll use what you told me when we plan a trip. You can change it later from your profile.",
    done: true,
    choices: [],
  };
}

export function profileFromIntro(history: IntroLine[], message: string): TravelerProfile {
  const lines = message.trim()
    ? [...history, { role: "user" as const, text: message.trim() }]
    : history;
  const answers: TravelerProfile["answers"] = [];
  let pending = "";
  for (const line of lines) {
    if (line.role === "assistant") pending = line.text.trim();
    else if (pending) {
      answers.push({ question: pending, answer: line.text.trim() });
      pending = "";
    }
  }
  const age = answers.find((item) => item.question.toLowerCase().includes(AGE_MARK))?.answer;
  const dream = answers.find((item) => item.question.toLowerCase().includes(DREAM_MARK))?.answer;
  return { completed: true, age, dream, answers };
}
