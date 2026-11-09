import { Suspense } from "react";
import { ThingsSearch } from "@/components/things/ThingsSearch";

export default function ThingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[#6B7280]">Loading…</div>}>
      <ThingsSearch />
    </Suspense>
  );
}
