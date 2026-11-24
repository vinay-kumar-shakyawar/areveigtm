"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function IcpRowActions({ slug, id, status }: { slug: string; id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (action: string, method = "POST") =>
    start(async () => {
      const res = await fetch(`/api/v1/w/${slug}/icps/${id}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify({ action }) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Failed");
        return;
      }
      toast.success(action === "duplicate" ? "Duplicated" : "Updated");
      router.refresh();
    });
  return (
    <div className="flex justify-end gap-1">
      {status !== "active" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("activate")}>
          Activate
        </Button>
      )}
      {status === "active" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("archive")}>
          Archive
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("duplicate")}>
        Duplicate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this ICP?")) act("delete", "DELETE");
        }}
      >
        Delete
      </Button>
    </div>
  );
}
