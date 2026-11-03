import Link from "next/link";
import { AvatarMenu } from "./AvatarMenu";

export function AppShell({
  children,
  userEmail,
  displayName,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  displayName?: string | null;
}) {
  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="text-lg font-semibold text-[#1616C9]">
            Waypoint
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[#6B7280] md:flex">
            <Link href="/dashboard" className="hover:text-[#1616C9]">
              Dashboard
            </Link>
            <Link href="/trips/new" className="hover:text-[#1616C9]">
              Create trip
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/trips/new"
              className="rounded-lg bg-[#1616C9] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1010A3] md:hidden"
            >
              New
            </Link>
            <AvatarMenu email={userEmail} displayName={displayName} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
