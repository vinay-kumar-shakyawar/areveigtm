"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface SearchItem {
  type: "lead" | "campaign" | "icp" | "page";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export function GlobalSearch({ workspaceSlug }: { workspaceSlug: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/w/${workspaceSlug}/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as { items: SearchItem[] };
          setItems(data.items);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [open, query, workspaceSlug]);

  const groups = groupBy(items, (i) => i.type);

  return (
    <>
      <Button
        variant="outline"
        className="w-full max-w-md justify-start gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left text-sm">Search leads, campaigns, ICPs…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a lead, campaign or page">
        <CommandInput placeholder="Type to search…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{loading ? "Searching…" : "No results."}</CommandEmpty>
          {(["page", "lead", "campaign", "icp"] as const).map((type) =>
            groups[type]?.length ? (
              <CommandGroup key={type} heading={LABELS[type]}>
                {groups[type].map((item) => (
                  <CommandItem
                    key={`${item.type}-${item.id}`}
                    value={`${item.type} ${item.title} ${item.subtitle ?? ""}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{item.title}</span>
                      {item.subtitle && <span className="text-xs text-muted-foreground">{item.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null,
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

const LABELS = { page: "Pages", lead: "Leads", campaign: "Campaigns", icp: "ICPs" } as const;

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Partial<Record<K, T[]>> {
  const out: Partial<Record<K, T[]>> = {};
  for (const item of arr) (out[key(item)] ??= []).push(item);
  return out;
}
