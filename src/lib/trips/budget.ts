export type BudgetAllocation = "sights" | "food" | "getting-around" | "mostly-free";
export type RestaurantStyle = "street" | "casual" | "sit-down" | "mix";

export type BudgetPlan = {
  total?: number;
  currency?: string;
  allocation?: BudgetAllocation;
  restaurantStyle?: RestaurantStyle;
};

const TOTAL_MARK = "how much is set aside for the whole trip";
const SPLIT_MARK = "how should that money be used";
const FOOD_MARK = "what kind of restaurants should the days lean toward";

export const BUDGET_QUESTION_MARKS = {
  total: TOTAL_MARK,
  split: SPLIT_MARK,
  food: FOOD_MARK,
};

const TOPIC = {
  total: /set aside for the (whole|entire) trip|how much is set aside|how much .{0,40}whole trip/,
  split: /how should that money be used|how .{0,40}money be used/,
  food: /what kind of restaurants|restaurants should the days/,
} as const;

export type BudgetTopic = keyof typeof TOPIC;

export function budgetTopicAsked(
  history: { role: string; text: string }[],
  topic: BudgetTopic,
): boolean {
  return history.some(
    (line) => line.role === "assistant" && TOPIC[topic].test(line.text.toLowerCase()),
  );
}

export function budgetQuestionsPending(history: { role: string; text: string }[]): boolean {
  return (
    !budgetTopicAsked(history, "total") ||
    !budgetTopicAsked(history, "split") ||
    !budgetTopicAsked(history, "food")
  );
}

export function repeatsBudgetTopic(
  history: { role: string; text: string }[],
  reply: string,
): boolean {
  const topics = Object.keys(TOPIC) as BudgetTopic[];
  return topics.some(
    (topic) => TOPIC[topic].test(reply.toLowerCase()) && budgetTopicAsked(history, topic),
  );
}

/** Read a budget ceiling, a split, and a restaurant style from choice labels or typed answers. */
export function budgetFromConversation(text: string): BudgetPlan {
  const plan: BudgetPlan = {};
  const lower = text.toLowerCase();

  if (/under\s*\$?\s*500/.test(lower)) plan.total = 500;
  else if (/\$?\s*1[,.]?500\s*(to|–|-)\s*\$?\s*3[,.]?000/.test(lower)) plan.total = 3000;
  else if (/\$?\s*500\s*(to|–|-)\s*\$?\s*1[,.]?500/.test(lower)) plan.total = 1500;
  else {
    const typed = text.match(/(?:\$|usd\s*)\s*(\d{2,6}(?:[,.]\d{3})?)/i);
    if (typed) {
      const amount = Number(typed[1].replace(/,/g, ""));
      if (Number.isFinite(amount) && amount > 0) plan.total = Math.round(amount);
    }
  }

  if (/mostly free/.test(lower)) plan.allocation = "mostly-free";
  else if (/getting around|transit|transport/.test(lower)) plan.allocation = "getting-around";
  else if (/mostly food|meals/.test(lower)) plan.allocation = "food";
  else if (/mostly sights|tickets/.test(lower)) plan.allocation = "sights";

  if (/street food/.test(lower)) plan.restaurantStyle = "street";
  else if (/one nicer meal|nicer meal/.test(lower)) plan.restaurantStyle = "sit-down";
  else if (/casual sit-down/.test(lower)) plan.restaurantStyle = "casual";
  else if (
    /restaurants should the days[\s\S]{0,180}\ba mix\b/.test(lower) ||
    /a mix of restaurants/.test(lower)
  ) {
    plan.restaurantStyle = "mix";
  }

  return plan;
}

export function allocationLabel(allocation?: BudgetAllocation): string {
  if (allocation === "sights") return "Mostly sights";
  if (allocation === "food") return "Mostly food";
  if (allocation === "getting-around") return "Mostly getting around";
  if (allocation === "mostly-free") return "Mostly free";
  return "Not set";
}

export function restaurantLabel(style?: RestaurantStyle): string {
  if (style === "street") return "Street food and casual counters";
  if (style === "casual") return "Casual sit-down";
  if (style === "sit-down") return "One nicer meal";
  if (style === "mix") return "A mix";
  return "Not set";
}
