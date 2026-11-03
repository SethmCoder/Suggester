"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
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
  }, []);

  async function save() {
    setStatus("saving");
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
    <div className="max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="mt-1 text-sm text-[#6B7280]">{email}</p>
      <div className="mt-6 space-y-4">
        <div>
          <Label>Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button onClick={save} disabled={status === "saving"}>
          Save
        </Button>
        {status === "saved" ? (
          <p className="text-sm text-[#15803D]">Saved</p>
        ) : null}
        {status === "error" ? (
          <p className="text-sm text-[#DC2626]">Couldn&apos;t save</p>
        ) : null}
      </div>
    </div>
  );
}
