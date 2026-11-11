import { redirect } from "next/navigation";

/** Discover is folded into the simpler Trips home. */
export default function DiscoverPage() {
  redirect("/dashboard");
}
