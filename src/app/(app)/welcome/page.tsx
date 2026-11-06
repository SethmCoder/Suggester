import { TravelerIntro } from "@/components/profile/TravelerIntro";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";
  return <TravelerIntro nextPath={nextPath} />;
}
