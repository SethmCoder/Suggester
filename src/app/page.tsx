import Link from "next/link";
import { TryDemoButton } from "@/components/demo/TryDemoButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F7F8FC] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold text-[#1616C9]">Waypoint</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#1F2937]">
          AI-powered travel itineraries
        </h1>
        <p className="mt-3 text-[#6B7280]">
          Personalized, geographically optimized day-by-day plans with verified
          place data and an in-itinerary assistant.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <TryDemoButton variant="primary" />
          <Link
            href="/login"
            className="rounded-lg border border-[#D1D5DB] px-4 py-2 text-sm font-medium text-[#1F2937] hover:bg-[#EEEEFF]"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-[#D1D5DB] px-4 py-2 text-sm font-medium text-[#1F2937] hover:bg-[#EEEEFF]"
          >
            Create account
          </Link>
        </div>
        <p className="mt-4 text-xs text-[#6B7280]">
          Demo uses a sample Paris itinerary. It does not call live AI or Maps
          APIs.
        </p>
      </div>
    </main>
  );
}
