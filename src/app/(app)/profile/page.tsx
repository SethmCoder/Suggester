"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        setEmail(user.email ?? "");
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.display_name) setDisplayName(data.display_name);
          });
      });
    } catch {
      /* demo */
    }
  }, []);

  async function save() {
    setStatus("saving");
    if (!isSupabaseConfigured()) {
      setStatus("error");
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("error");
      return;
    }
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName,
    });
    setStatus(error ? "error" : "saved");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1F2937]">
          Profile
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Account details for your Waypoint workspace.
        </p>
      </div>
      <div className="rounded-[16px] border border-[#E1E5F0] bg-white p-6 shadow-[0_4px_20px_rgba(8,11,58,0.05)]">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0400FF] text-xl font-bold text-white">
            {(displayName || email || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-[#1F2937]">
              {displayName || "Traveler"}
            </p>
            <p className="text-sm text-[#6B7280]">{email || "Not signed in"}</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Button onClick={save} disabled={status === "saving"}>
            Save
          </Button>
          <Link
            href="/settings"
            className="ml-3 text-sm font-semibold text-[#0400FF]"
          >
            Open full settings →
          </Link>
          {status === "saved" ? (
            <p className="text-sm text-[#15803D]">Saved</p>
          ) : null}
          {status === "error" ? (
            <p className="text-sm text-[#DC2626]">Couldn&apos;t save</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
