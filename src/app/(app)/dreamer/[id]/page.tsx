import { redirect } from "next/navigation";

export default async function DreamerDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/future-plans/${id}`);
}
