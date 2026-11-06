"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChoiceList } from "@/components/chat/ChoiceList";
import { Button } from "@/components/ui/Button";
import { INTRO_COOKIE, TRAVELER_STORAGE_KEY, type TravelerProfile } from "@/lib/profile/traveler";

type Line = { role: "agent" | "you"; text: string };
type Choice = { id: string; label: string };

export function TravelerIntro({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [log, setLog] = useState<Line[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [other, setOther] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = readLocal();
    if (saved?.completed) {
      document.cookie = `${INTRO_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
      router.replace(nextPath);
      return;
    }
    void fetch("/api/profile/intro")
      .then((res) => res.json())
      .then((data: { profile?: TravelerProfile }) => {
        if (data.profile?.completed) {
          writeLocal(data.profile);
          document.cookie = `${INTRO_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
          router.replace(nextPath);
          return;
        }
        return ask([], "");
      })
      .catch(() => setStatus("error"));
  }, [nextPath, router]);

  async function ask(history: { role: "user" | "assistant"; text: string }[], message: string) {
    setStatus("loading");
    const res = await fetch("/api/profile/intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not continue");
    setChoices((data.choices as Choice[]) ?? []);
    setOther(false);
    setLog((prev) => [...prev, { role: "agent", text: data.reply as string }]);
    setStatus("ready");
    if (data.done && data.profile) {
      writeLocal(data.profile as TravelerProfile);
      document.cookie = `${INTRO_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
      window.setTimeout(() => router.push(nextPath), 900);
    }
  }

  async function send(text: string) {
    const said = text.trim();
    if (!said || status === "loading") return;
    const history = log.map((line) => ({
      role: line.role === "you" ? ("user" as const) : ("assistant" as const),
      text: line.text,
    }));
    setLog((prev) => [...prev, { role: "you", text: said }]);
    setDraft("");
    setChoices([]);
    try {
      await ask(history, said);
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-[20px] border border-[#E1E5F0] bg-white p-5 shadow-[0_8px_24px_rgba(8,11,58,0.05)] sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0400FF]">New account</p>
      <h1 className="mt-1 text-2xl font-bold text-[#080B3A]">Let me learn how you like to travel</h1>
      <p className="mt-2 text-sm text-[#6B7280]">
        A few choices, then the planner uses them on your trips. Pick Other if none of the answers fit.
      </p>
      <div className="mt-5 space-y-3">
        {log.map((line, index) => (
          <p
            key={`${line.role}-${index}`}
            className={`max-w-[90%] rounded-[18px] px-4 py-3 text-sm leading-relaxed ${
              line.role === "agent" ? "bg-[#F5F7FF] text-[#1F2937]" : "ml-auto bg-[#080B3A] text-white"
            }`}
          >
            {line.text}
          </p>
        ))}
        {status === "ready" ? (
          <ChoiceList
            choices={choices}
            onPick={(label) => void send(label)}
            onOther={() => {
              setOther(true);
              box.current?.focus();
            }}
          />
        ) : null}
        {status === "loading" ? <p className="text-sm text-[#0400FF]">Thinking…</p> : null}
        {status === "error" ? (
          <p className="text-sm text-[#DC2626]">That reply did not come through. You can try again.</p>
        ) : null}
      </div>
      <div className="mt-4 flex items-end gap-2 rounded-[16px] border border-[#D1D7E5] bg-[#F5F7FF] p-2">
        <textarea
          ref={box}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={other ? "Type your own answer" : "Or type your own answer"}
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#080B3A] outline-none placeholder:text-[#9299B5]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <Button type="button" onClick={() => void send(draft)} disabled={!draft.trim() || status === "loading"}>
          Send
        </Button>
      </div>
    </section>
  );
}

function readLocal(): TravelerProfile | null {
  try {
    const raw = localStorage.getItem(TRAVELER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TravelerProfile;
  } catch {
    return null;
  }
}

function writeLocal(profile: TravelerProfile) {
  localStorage.setItem(TRAVELER_STORAGE_KEY, JSON.stringify(profile));
}
