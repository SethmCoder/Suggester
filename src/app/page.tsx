import Link from "next/link";
import { TryDemoButton } from "@/components/demo/TryDemoButton";
import { dashboardHeroImage } from "@/lib/destination-image";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080B3A] text-white">
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-35"
          style={{ backgroundImage: `url(${dashboardHeroImage()})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080B3A]/70 via-[#080B3A]/85 to-[#080B3A]" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-start px-6 py-20 sm:py-28">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0400FF] text-sm font-bold">
              W
            </div>
            <span className="text-lg font-bold tracking-tight">Waypoint</span>
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            AI-powered itineraries that feel handcrafted.
          </h1>
          <p className="mt-4 max-w-xl text-base text-[#C5CAE5] sm:text-lg">
            Personalized, geographically optimized day-by-day plans — with an
            itinerary maker that adapts when your plans change.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TryDemoButton variant="primary" />
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-[12px] border border-[#292F68] bg-[#11165A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20276D]"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-[12px] px-4 py-2.5 text-sm font-semibold text-[#C5CAE5] hover:text-white"
            >
              Create account
            </Link>
          </div>
          <p className="mt-5 text-xs text-[#9299B5]">
            Demo works without API keys. Connect Supabase, Groq, and maps when
            you&apos;re ready for live generation.
          </p>
        </div>
      </div>
    </main>
  );
}
