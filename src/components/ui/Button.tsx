import { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-[#0400FF] text-white hover:bg-[#0A0080] shadow-sm shadow-[#0400FF]/20",
  secondary:
    "border border-[#E1E5F0] bg-white text-[#1F2937] hover:bg-[#DDE1FF]/60",
  ghost: "text-[#0400FF] hover:bg-[#DDE1FF]/70",
  dark: "bg-[#11165A] text-white hover:bg-[#20276D]",
  danger: "bg-[#DC2626] text-white hover:bg-[#b91c1c]",
};

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#818CFF] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
