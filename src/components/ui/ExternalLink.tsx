import type { AnchorHTMLAttributes, ReactNode } from "react";
import { IconExternalLink } from "@/components/ui/Icons";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  /** Icon size in px. Default 12. */
  iconSize?: number;
};

/** Anchor that opens off-site and shows the square + up-right arrow. */
export function ExternalLink({
  children,
  className = "",
  iconSize = 12,
  rel,
  target = "_blank",
  ...props
}: Props) {
  return (
    <a
      {...props}
      target={target}
      rel={rel ?? "noopener noreferrer"}
      className={`inline-flex items-center gap-1 ${className}`.trim()}
    >
      <span>{children}</span>
      <IconExternalLink size={iconSize} className="shrink-0 opacity-80" />
    </a>
  );
}
