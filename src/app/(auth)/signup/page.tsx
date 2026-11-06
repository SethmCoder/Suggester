"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080B3A] px-4">
        <p className="rounded-[14px] bg-white px-6 py-4 text-[#DC2626]">
          Accounts aren’t available yet. Try the demo to plan a trip on this device.
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setLoading(false);
      setError("Accounts aren’t available yet.");
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const res = await fetch(
      `${url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          data: { display_name: displayName },
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      user?: { id?: string };
      msg?: string;
      message?: string;
      error_description?: string;
    };
    if (!res.ok) {
      setLoading(false);
      setError(
        data.msg || data.error_description || data.message || "Could not create the account.",
      );
      return;
    }
    if (!data.access_token || !data.refresh_token) {
      setLoading(false);
      setNotice("Check your email for confirmation.");
      return;
    }
    const supabase = createClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) {
      setLoading(false);
      setError(sessionError.message);
      return;
    }
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId,
        display_name: displayName || email.split("@")[0],
      });
    }
    await fetch("/api/demo/end", { method: "POST" }).catch(() => null);
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080B3A] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-[16px] border border-[#292F68] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="h-1.5 bg-[#0400FF]" />
        <div className="p-8">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
            Create account
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Join Waypoint and start planning smarter trips.
          </p>
          {notice ? (
            <p className="mt-6 text-sm leading-relaxed text-[#1F2937]">{notice}</p>
          ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label>Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seth"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : "Sign up"}
            </Button>
          </form>
          )}
          <p className="mt-6 text-center text-sm text-[#6B7280]">
            <Link href="/login" className="font-semibold text-[#0400FF]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
