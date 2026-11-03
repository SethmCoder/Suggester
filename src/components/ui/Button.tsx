import { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-[#1616C9] text-white hover:bg-[#1010A3] disabled:opacity-60",
  secondary:
    "border border-[#D1D5DB] bg-white text-[#1F2937] hover:bg-[#EEEEFF]",
  ghost: "text-[#1616C9] hover:bg-[#EEEEFF]",
};

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#818CF8] ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
