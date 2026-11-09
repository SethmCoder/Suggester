"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CreateAccountLink } from "@/components/auth/CreateAccountLink";
import { TryDemoButton } from "@/components/demo/TryDemoButton";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const linkError = params.get("error_description") ?? params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#6B7280]">
          Sign-in isn’t available yet. Try the demo to plan a trip on this
          device.
        </p>
        <TryDemoButton className="w-full" variant="primary" />
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    // Returning sign-in: mark intro done and hard-navigate so middleware
    // never bounces an existing account into the new-account survey.
    await fetch("/api/profile/intro/complete", { method: "POST" }).catch(
      () => null,
    );
    const safeNext =
      next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    window.location.assign(safeNext);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label>Email</Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="mb-0">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-[#0400FF] hover:text-[#0A0080]"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      {linkError ? (
        <p className="text-sm text-[#DC2626]">
          {linkError === "auth"
            ? "That confirmation link is invalid or expired. Sign in after you confirm, or sign up again."
            : linkError}
        </p>
      ) : null}
      {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080B3A] px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 20%, #0400FF55, transparent 50%), radial-gradient(ellipse at 80% 80%, #11165Aaa, transparent 45%)",
        }}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-[16px] border border-[#292F68] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="h-1.5 w-full bg-[#0400FF]" />
        <div className="p-7 sm:p-9">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0400FF] text-lg font-bold text-white">
              W
            </div>
            <p className="text-sm font-semibold text-[#0400FF]">Waypoint</p>
            <h1 className="mt-2 text-[28px] font-bold tracking-tight text-[#1F2937]">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              Sign in to continue planning your next adventure.
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#E1E5F0]" />
            <span className="text-xs text-[#9299B5]">or</span>
            <div className="h-px flex-1 bg-[#E1E5F0]" />
          </div>
          <TryDemoButton className="w-full" variant="secondary" />
          <p className="mt-6 text-center text-sm text-[#6B7280]">
            No account?{" "}
            <CreateAccountLink className="font-semibold text-[#0400FF] hover:text-[#0A0080]">
              Create account
            </CreateAccountLink>
          </p>
        </div>
      </div>
    </div>
  );
}
