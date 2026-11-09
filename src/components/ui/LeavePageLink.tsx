import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { IconExternalLink } from "@/components/ui/Icons";

type Props = Omit<ComponentProps<typeof Link>, "children"> & {
  children: ReactNode;
  /** Visual weight matching Button variants. */
  variant?: "primary" | "secondary" | "ghost";
  iconSize?: number;
  className?: string;
};

const variants = {
  primary:
    "bg-[#0400FF] text-white hover:bg-[#0A0080] shadow-sm shadow-[#0400FF]/20",
  secondary:
    "border border-[#E1E5F0] bg-white text-[#1F2937] hover:bg-[#DDE1FF]/60",
  ghost: "text-[#0400FF] hover:bg-[#DDE1FF]/70",
};

/**
 * In-app navigation that leaves the current page. Shows the square + up-right
 * arrow so travelers know the control takes them somewhere else.
 */
export function LeavePageLink({
  children,
  className = "",
  variant = "secondary",
  iconSize = 12,
  ...props
}: Props) {
  return (
    <Link
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[12px] px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#818CFF] focus:ring-offset-2 ${variants[variant]} ${className}`.trim()}
    >
      <span>{children}</span>
      <IconExternalLink size={iconSize} className="shrink-0 opacity-80" aria-hidden />
    </Link>
  );
}
