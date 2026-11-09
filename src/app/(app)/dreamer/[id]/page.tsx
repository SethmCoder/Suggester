import { DreamerDetail } from "@/components/dreamer/DreamerDetail";

export default async function DreamerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DreamerDetail id={id} />;
}
