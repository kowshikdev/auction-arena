import Image from "next/image";
import { cn } from "@/lib/cn";

/** "IPL 2027 Mini Auction" label with the IPL mark, shown wherever an auction is on screen. */
export function SeasonTag({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const logo = { sm: 26, md: 34, lg: 54 }[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image src="/logos/ipl.png" alt="IPL" width={logo} height={Math.round(logo * 0.68)} className="shrink-0 object-contain" />
      <span
        className={cn(
          "display whitespace-nowrap tracking-wide",
          size === "sm" && "text-sm",
          size === "md" && "text-base",
          size === "lg" && "text-xl",
        )}
      >
        IPL 2027 <span className="gold-text">Mini Auction</span>
      </span>
    </span>
  );
}
