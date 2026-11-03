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
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080B3A] px-4">
        <p className="rounded-[14px] bg-white px-6 py-4 text-[#DC2626]">
          Configure Supabase in .env to create an account.
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        display_name: displayName || email.split("@")[0],
      });
    }
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
