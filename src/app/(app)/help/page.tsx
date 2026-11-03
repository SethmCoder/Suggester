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
    a: "Open your itinerary and use Ask itinerary maker — for example “My flight is delayed by 2 hours on day 1” — then approve the proposed reshuffle.",
  },
];

const DISCOVERY = [
  {
    title: "1. OpenStreetMap place discovery",
    body: "Waypoint queries public OpenStreetMap data (Overpass) for restaurants, museums, parks, viewpoints, and more near your destination. No account or API key. Results are cached about 24 hours. Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).",
  },
  {
    title: "2. Wikimedia online interest",
    body: "When an OSM place is confidently linked to a Wikipedia article, Waypoint compares the last seven complete days of pageviews to the prior seven. Rising views may show as “Online interest increasing.” This is a weak secondary signal — not foot traffic, Instagram, or “most visited.” Places without a verified article stay neutral.",
  },
  {
    title: "3. Sorted Travel destination context",
    body: "Optional destination-level facts (brief, weather, currency) come from Sorted Travel’s free zero-auth tools. Sorted does not provide trending restaurants or venues; Waypoint never pretends otherwise.",
  },
  {
    title: "4. How ranking works",
    body: "Default weights: ~65% your interests and itinerary fit, 15% geography, 10% place-data quality, 10% online interest. If interest data is missing, its weight is redistributed — never invented. Your preferences always outrank a rising Wikipedia chart.",
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
          Quick answers and how discovery & online interest work.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[18px] font-semibold text-[#080B3A]">
          How discovery & online interest work
        </h2>
        <p className="text-sm text-[#6B7280]">
          Waypoint uses only free, accountless sources for place discovery and
          interest signals. Paid or login-gated APIs are not used for this
          feature.
        </p>
        {DISCOVERY.map((d) => (
          <div
            key={d.title}
            className="rounded-[14px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
          >
            <h3 className="text-[15px] font-semibold text-[#080B3A]">
              {d.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              {d.body}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[18px] font-semibold text-[#080B3A]">FAQ</h2>
        {FAQS.map((f) => (
          <div
            key={f.q}
            className="rounded-[14px] border border-[#E1E5F0] bg-white p-5 shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
          >
            <h3 className="text-[16px] font-semibold text-[#080B3A]">{f.q}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{f.a}</p>
          </div>
        ))}
      </section>

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
