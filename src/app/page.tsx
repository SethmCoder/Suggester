import Link from "next/link";
import { CreateAccountLink } from "@/components/auth/CreateAccountLink";
import { TryDemoButton } from "@/components/demo/TryDemoButton";
import { LocalHeroBackground } from "@/components/home/LocalHero";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080B3A] text-white">
      <div className="relative overflow-hidden">
        <LocalHeroBackground opacityClass="opacity-55" showCaption />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080B3A]/55 via-[#080B3A]/75 to-[#080B3A]" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-start px-6 py-20 sm:py-28">
          <div className="mb-8 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/waypoint-mark-transparent.png"
              alt=""
              className="h-20 w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.28)]"
            />
            <div>
              <p className="text-[1.65rem] font-bold leading-none tracking-tight">
                Waypoint
              </p>
              <p className="mt-1 text-sm font-medium text-[#C5CAE5]">
                Plan smarter. Travel better.
              </p>
            </div>
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            AI-powered itineraries that feel handcrafted.
          </h1>
          <p className="mt-4 max-w-xl text-base text-[#C5CAE5] sm:text-lg">
            Personalized, geographically optimized day-by-day plans — with
            Trip Wizard, your travel agent, when plans change.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TryDemoButton variant="primary" />
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-[12px] border border-[#292F68] bg-[#11165A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20276D]"
            >
              Sign in
            </Link>
            <CreateAccountLink className="inline-flex items-center justify-center rounded-[12px] px-4 py-2.5 text-sm font-semibold text-[#C5CAE5] hover:text-white">
              Create account
            </CreateAccountLink>
          </div>
          <p className="mt-5 text-xs text-[#9299B5]">
            Try a sample trip now. Sign in when you want trips saved to your
            account.
          </p>
        </div>
      </div>
    </main>
  );
}
