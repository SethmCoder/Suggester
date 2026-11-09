import { redirect } from "next/navigation";

export default async function FutureTripRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dreamer/${id}`);
}
