import { Suspense } from "react";
import { LocalExplorer } from "@/components/explorer/LocalExplorer";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          Loading explorer…
        </div>
      }
    >
      <LocalExplorer />
    </Suspense>
  );
}
