import { Suspense } from "react";
import { CompareBoard } from "@/components/discover/CompareBoard";

export default function DiscoverComparePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          Loading comparison…
        </div>
      }
    >
      <CompareBoard />
    </Suspense>
  );
}
