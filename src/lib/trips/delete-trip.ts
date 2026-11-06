import { hideTripLocally } from "@/lib/offline/trips";

/** Remove a trip from the account when it has one, and from this device. */
export async function deleteTrip(id: string): Promise<{ ok: boolean; error?: string }> {
  const onDeviceOnly = id.startsWith("offline-") || id.startsWith("demo-");
  if (!onDeviceOnly) {
    const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Could not delete this trip" };
    }
  }
  hideTripLocally(id);
  return { ok: true };
}
