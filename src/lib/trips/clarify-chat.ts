import type { ClarifyInput } from "@/lib/trips/clarify";

export type ChatLine = { role: "user" | "assistant"; text: string };

/** Used only when the model is down or returns nothing. One open question, not a checklist. */
export function localClarifyReply(
  input: ClarifyInput,
  history: ChatLine[],
  message: string,
): { reply: string; done: boolean } {
  const place = input.destination?.trim() || "this trip";
  const trimmed = message.trim();
  const userTurns =
    history.filter((line) => line.role === "user").length + (trimmed ? 1 : 0);
  const done = userTurns >= 4;

  if (!trimmed) {
    return {
      reply: input.destination?.trim()
        ? `I'm planning ${place} with you. What do you want these days to feel like?`
        : "Tell me the city and I'll start shaping the days around it.",
      done: false,
    };
  }

  if (done) {
    return {
      reply: `I have enough to shape ${place}. Add anything you want kept in the days, or generate when the brief looks right.`,
      done: true,
    };
  }

  return {
    reply: `I can keep talking about ${place}. What would a dream version of these days include, and what have you enjoyed on trips before?`,
    done: false,
  };
}

export function replyIgnoresTraveler(_message: string, reply: string): boolean {
  return reply.trim().length < 8;
}
