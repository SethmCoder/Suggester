import { createServiceClient } from "@/lib/supabase/server";

export async function findUserIdByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const svc = createServiceClient();
  if (!svc) return null;
  let page = 1;
  for (let i = 0; i < 20; i++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === normalized,
    );
    if (match?.id) {
      return { id: match.id, email: match.email ?? normalized };
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}
