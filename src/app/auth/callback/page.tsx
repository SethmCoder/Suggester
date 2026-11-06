"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function readableAuthError(message: string) {
  if (/code verifier/i.test(message)) {
    return "Open the confirmation link in the same browser you used to sign up, or sign up again and use the new email.";
  }
  return message;
}

function safeNext(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      if (!isSupabaseConfigured()) {
        setError("Accounts aren’t available yet.");
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const described =
        hash.get("error_description") ?? params.get("error_description");
      if (described || params.get("error") || hash.get("error")) {
        setError(
          described?.replace(/\+/g, " ") ??
            "That confirmation link is invalid or expired.",
        );
        return;
      }

      const supabase = createClient();
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type") ?? hash.get("type");
      const next = safeNext(
        params.get("next"),
        type === "recovery" ? "/reset-password" : "/dashboard",
      );

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setError(readableAuthError(exchangeError.message));
          return;
        }
      } else if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (cancelled) return;
        if (verifyError) {
          setError(readableAuthError(verifyError.message));
          return;
        }
      } else {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError || !data.session) {
          setError(
            readableAuthError(
              sessionError?.message ??
                "That confirmation link is invalid or expired.",
            ),
          );
          return;
        }
      }

      await fetch("/api/demo/end", { method: "POST" }).catch(() => null);
      if (cancelled) return;
      router.replace(next);
      router.refresh();
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080B3A] px-4">
      <div className="w-full max-w-md rounded-[16px] bg-white p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        {error ? (
          <>
            <h1 className="text-[22px] font-bold text-[#1F2937]">
              Confirmation didn’t finish
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">{error}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex font-semibold text-[#0400FF]"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-[22px] font-bold text-[#1F2937]">
              Confirming your email
            </h1>
            <p className="mt-3 text-sm text-[#6B7280]">
              This link signs you in and opens your trips.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#080B3A] text-white">
          Confirming your email
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
