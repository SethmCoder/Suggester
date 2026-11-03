import Link from "next/link";

const FAQS = [
  {
    q: "How does demo mode work?",
    a: "Try demo opens a sample Paris itinerary without API keys. Edits stay in your browser until you sign up.",
  },
  {
    q: "Do I need Google Maps?",
    a: "No. OpenStreetMap is the default for maps, places, routes, and opening hours when tagged. Switch providers in Settings if you add Google keys later.",
  },
  {
    q: "How do I adjust for a delayed flight?",
    a: "Open your itinerary and use Ask itinerary maker — for example “My flight is delayed by 2 hours on day 1” — then approve the proposed schedule shift.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
          Help & Support
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Quick answers for getting the most from Waypoint.
        </p>
      </div>
      <div className="space-y-3">
        {FAQS.map((f) => (
          <div
            key={f.q}
            className="rounded-[14px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
          >
            <h2 className="text-[16px] font-semibold text-[#080B3A]">{f.q}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{f.a}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-[#6B7280]">
        Need more? Visit{" "}
        <Link href="/settings" className="font-semibold text-[#0400FF]">
          Settings
        </Link>{" "}
        or open a trip and chat with the itinerary maker.
      </p>
    </div>
  );
}
