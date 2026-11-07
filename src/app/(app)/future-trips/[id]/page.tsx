import { FutureTripDetail } from "@/components/future-trips/FutureTripDetail";

export default async function FutureTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FutureTripDetail id={id} />;
}
