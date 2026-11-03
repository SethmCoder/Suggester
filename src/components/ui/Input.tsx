import { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm text-[#1F2937] focus:border-[#818CF8] focus:outline-none focus:ring-2 focus:ring-[#818CF8]/40 ${className}`}
      {...props}
    />
  );
}

export function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-medium text-[#1F2937] ${className}`}>
      {children}
    </label>
  );
}
