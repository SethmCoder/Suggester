import { cookies } from "next/headers";
import { groqModel, proGroqModel } from "@/lib/ai/groq";
import { ENTITLEMENT_COOKIE } from "@/lib/billing/entitlements";

/** Free and Pro use GROQ_MODEL, defaulting to openai/gpt-oss-120b. Pro can set GROQ_PRO_MODEL. */
export async function plannerModel(): Promise<string> {
  try {
    const jar = await cookies();
    return jar.get(ENTITLEMENT_COOKIE)?.value === "pro" ? proGroqModel() : groqModel();
  } catch {
    return groqModel();
  }
}
