import Link from "next/link";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { CreateAccountLink } from "@/components/auth/CreateAccountLink";
import { TryDemoButton } from "@/components/demo/TryDemoButton";
import { LocalHeroBackground } from "@/components/home/LocalHero";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-landing-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-landing-body",
});

export default function Home() {
  return (
    <main
      className={`${display.variable} ${body.variable} min-h-screen bg-[#080B3A] text-white`}
    >
      <div className="relative flex min-h-screen overflow-hidden">
        <LocalHeroBackground opacityClass="opacity-50" showCaption={false} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#080B3A]/40 via-[#080B3A]/72 to-[#0400FF]/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(4,0,255,0.22),transparent_55%)]" />

        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-start justify-center px-6 py-20 sm:px-10 sm:py-28">
          <p
            className="text-[clamp(2.75rem,8vw,4.5rem)] font-semibold leading-[0.95] tracking-tight text-white"
            style={{ fontFamily: "var(--font-landing-display), Georgia, serif" }}
          >
            Waypoint
          </p>
          <p
            className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C5CAE5]"
            style={{ fontFamily: "var(--font-landing-body), system-ui, sans-serif" }}
          >
            Travel planning
          </p>

          <h1
            className="mt-8 max-w-2xl text-[clamp(1.35rem,3.2vw,1.85rem)] font-medium leading-snug text-white"
            style={{ fontFamily: "var(--font-landing-display), Georgia, serif" }}
          >
            Imagine this: you&apos;ve finally booked a flight to somewhere
            you&apos;ve always wanted to visit, but you don&apos;t know how long
            to stay, what to do, or how to make the most of your time there.
          </h1>

          <p
            className="mt-5 max-w-2xl text-base leading-relaxed text-[#DDE1FF] sm:text-lg"
            style={{ fontFamily: "var(--font-landing-body), system-ui, sans-serif" }}
          >
            Waypoint organizes your booking emails in one place and uses AI to
            build a personalized trip around your reservations and preferences —
            so you spend less time planning, miss fewer experiences, and make
            the most of every trip.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <TryDemoButton variant="primary" />
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-[12px] border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/16"
              style={{
                fontFamily: "var(--font-landing-body), system-ui, sans-serif",
              }}
            >
              Sign in
            </Link>
            <CreateAccountLink className="inline-flex items-center justify-center rounded-[12px] border border-white/25 bg-transparent px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 [font-family:var(--font-landing-body),system-ui,sans-serif]">
              Create account
            </CreateAccountLink>
          </div>
        </div>
      </div>
    </main>
  );
}
