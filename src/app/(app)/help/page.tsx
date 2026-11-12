import Link from "next/link";

const FAQS = [
  {
    q: "How do I try Waypoint?",
    a: "Choose Try demo on the start page. You’ll get sample trips for Paris and Dubai, and you can plan a new trip that stays on this device.",
  },
  {
    q: "How does Waypoint pick places?",
    a: "It looks at the cities and hotels you enter, then builds a day around your interests, pace, and how far each stop is from the last one.",
  },
  {
    q: "Are times and tickets confirmed?",
    a: "No. Travel times and flight windows are estimates so the day is realistic. Book trains, flights, and tickets with the operator before you go.",
  },
  {
    q: "How do I adjust for a delayed flight?",
    a: "Open the trip and choose Trip Wizard. Tell them the delay, for example “My flight is two hours late on day 1,” then accept the revised plan.",
  },
  {
    q: "What is the difference between Free and Plus?",
    a: "Free includes 2 active trips and core planning. Plus removes the trip cap and unlocks advanced planning tools. A Trip Pass upgrades one trip without a subscription. See Pricing or Settings for plans.",
  },
  {
    q: "Where are my trips saved?",
    a: "Until you create an account, trips stay in this browser. After you sign in, they’re saved to your profile.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
          Help & Support
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          How planning, hotels, and saved trips work.
        </p>
      </div>

      <section className="space-y-3">
        {FAQS.map((item) => (
          <div
            key={item.q}
            className="rounded-[14px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
          >
            <h2 className="text-[16px] font-semibold text-[#080B3A]">
              {item.q}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              {item.a}
            </p>
          </div>
        ))}
      </section>

      <p className="text-sm text-[#6B7280]">
        Still stuck? Open{" "}
        <Link href="/settings" className="font-semibold text-[#0400FF]">
          Settings
        </Link>{" "}
        or ask Trip Wizard inside a trip.
      </p>
    </div>
  );
}
