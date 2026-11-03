import { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-11 w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] transition-colors focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
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
    <label
      className={`mb-1.5 block text-sm font-semibold text-[#1F2937] ${className}`}
    >
      {children}
    </label>
  );
}

export function TextArea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-[12px] border border-[#D1D7E5] bg-white px-3.5 py-2.5 text-sm text-[#1F2937] placeholder:text-[#9299B5] focus:border-[#0400FF] focus:outline-none focus:ring-2 focus:ring-[#818CFF]/35 ${className}`}
      {...props}
    />
  );
}
