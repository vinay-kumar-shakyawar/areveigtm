"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationCenter({ workspaceSlug, initialUnread }: { workspaceSlug: string; initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/w/${workspaceSlug}/notifications`);
      if (res.ok) {
        const data = (await res.json()) as { items: NotificationItem[]; unread: number };
        setItems(data.items);
        setUnread(data.unread);
      }
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await fetch(`/api/v1/w/${workspaceSlug}/notifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnread(0);
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void load();
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} />}>
        <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0}>
            Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && !items ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : !items || items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">You are all caught up.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className={n.readAt ? "bg-background" : "bg-primary/5"}>
                  {n.link ? (
                    <Link href={n.link} className="block px-4 py-3 hover:bg-muted" onClick={() => setOpen(false)}>
                      <NotificationBody n={n} />
                    </Link>
                  ) : (
                    <div className="px-4 py-3">
                      <NotificationBody n={n} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationBody({ n }: { n: NotificationItem }) {
  return (
    <>
      <div className="text-sm font-medium">{n.title}</div>
      {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
      <div className="mt-1 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</div>
    </>
  );
}
