import { cn } from "@/lib/utils";

/** Original AREVEI GTM mark: a compass-like arrow inside a rounded square. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="26" height="26" rx="7" className="fill-primary" />
        <path d="M8 19.5 L20 8.5 M20 8.5 H13.5 M20 8.5 V15" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {!compact && (
        <span className="text-base leading-none">
          AREVEI <span className="text-muted-foreground font-medium">GTM</span>
        </span>
      )}
    </span>
  );
}
