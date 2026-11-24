import { z } from "zod";

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Cursor = last item's id (uuid), paired with `orderBy: { createdAt, id }` in callers. */
export function encodeCursor(input: { createdAt: Date; id: string }): string {
  return Buffer.from(`${input.createdAt.toISOString()}|${input.id}`).toString("base64url");
}

export function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function toPage<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}
