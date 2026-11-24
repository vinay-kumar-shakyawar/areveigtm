"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "", label: "General" },
  { href: "/members", label: "Members" },
  { href: "/api-keys", label: "API keys" },
  { href: "/webhooks", label: "Webhooks" },
  { href: "/audit", label: "Audit log" },
  { href: "/profile", label: "Your profile" },
];

export function SettingsNav({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings">
      {ITEMS.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
