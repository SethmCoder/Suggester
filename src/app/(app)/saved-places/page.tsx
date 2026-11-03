import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { IconPin } from "@/components/ui/Icons";

export default function SavedPlacesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
          Saved Places
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Bookmark destinations and activities from your itineraries.
        </p>
      </div>
      <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-8 py-16 text-center shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDE1FF] text-[#0400FF]">
          <IconPin size={22} />
        </div>
        <p className="text-lg font-semibold">No saved places yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
          As you explore itineraries, you&apos;ll be able to collect favorite
          stops here. Open a trip to get started.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
