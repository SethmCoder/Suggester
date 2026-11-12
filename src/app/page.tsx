import Link from "next/link";
import { CreateAccountLink } from "@/components/auth/CreateAccountLink";
import { TryDemoButton } from "@/components/demo/TryDemoButton";
import { LocalHeroBackground } from "@/components/home/LocalHero";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080B3A] text-white">
      <div className="relative flex min-h-screen overflow-hidden">
        <LocalHeroBackground opacityClass="opacity-55" showCaption={false} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080B3A]/55 via-[#080B3A]/75 to-[#080B3A]" />
        <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-start justify-center px-6 py-20 sm:py-28">
          <h1 className="sr-only">Waypoint</h1>
          <div className="mb-10 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/waypoint-mark-transparent.png"
              alt=""
              className="h-20 w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.28)]"
            />
            <p className="text-[1.65rem] font-bold leading-none tracking-tight">
              Waypoint
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TryDemoButton variant="primary" />
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-[12px] border border-[#292F68] bg-[#11165A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20276D]"
            >
              Sign in
            </Link>
            <CreateAccountLink className="inline-flex items-center justify-center rounded-[12px] border border-[#292F68] bg-transparent px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#11165A]">
              Create account
            </CreateAccountLink>
          </div>
        </div>
      </div>
    </main>
  );
}
