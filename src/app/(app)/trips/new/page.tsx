import { cookies } from "next/headers";
import { CreateTripWizard } from "@/components/trips/CreateTripWizard";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";

export default async function NewTripPage() {
  const cookieStore = await cookies();
  const preview = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  return <CreateTripWizard previewMode={preview} />;
}
