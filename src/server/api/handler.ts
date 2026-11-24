import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { prisma } from "@/server/db/client";
import { getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { sha256 } from "@/server/auth/tokens";
import { workspaceContextForUser, type Ctx } from "@/server/auth/context";
import { ApiError, toErrorResponse } from "@/server/api/errors";
import { logger } from "@/server/logger";
import { rateLimit } from "@/server/api/rate-limit";

export interface ApiContext<TBody = unknown, TQuery = unknown> {
  req: NextRequest;
  requestId: string;
  user: CurrentUser | null;
  ctx: Ctx;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
}

export interface HandlerOptions<TBody, TQuery> {
  body?: z.ZodType<TBody>;
  query?: z.ZodType<TQuery>;
  /** Resolve workspace from the route param name (default "workspace"); set false for user-level endpoints. */
  workspaceParam?: string | false;
  /** Rate limit key suffix; defaults to route path. */
  rateLimit?: { limit: number; windowSec: number };
  /** Allow API keys (default true). */
  allowApiKey?: boolean;
}

type RouteParams = { params: Promise<Record<string, string>> } | { params?: Promise<Record<string, string>> };

/**
 * Wraps a route handler: request id, authentication (session cookie or
 * `Authorization: Bearer <api key>`), tenant resolution, validation, error envelope.
 */
export function apiHandler<TBody = undefined, TQuery = undefined>(
  options: HandlerOptions<TBody, TQuery>,
  fn: (c: ApiContext<TBody, TQuery>) => Promise<Response | NextResponse | object>,
) {
  return async (req: NextRequest, routeCtx?: RouteParams): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? nanoid(16);
    const started = Date.now();
    try {
      const params = (await routeCtx?.params) ?? {};
      const authHeader = req.headers.get("authorization");
      let user: CurrentUser | null = null;
      let ctx: Ctx | null = null;

      const rl = options.rateLimit ?? { limit: 300, windowSec: 60 };
      // Routes with their own limit get their own bucket so the global per-user counter does not starve them.
      const bucket = options.rateLimit ? `:${req.nextUrl.pathname}` : "";
      const ipKey = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

      if (authHeader?.startsWith("Bearer ")) {
        const raw = authHeader.slice(7).trim();
        if (raw.startsWith("agk_") && options.allowApiKey !== false) {
          const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(raw) }, include: { workspace: true } });
          if (!key || key.revokedAt || key.workspace.deletedAt) throw ApiError.unauthorized("Invalid API key");
          await rateLimit(`key:${key.id}${bucket}`, rl.limit, rl.windowSec);
          prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
          ctx = {
            workspaceId: key.workspaceId,
            workspaceSlug: key.workspace.slug,
            userId: null,
            role: key.scopes.includes("admin") ? "admin" : key.scopes.includes("write") ? "member" : "member",
            requestId,
            actorType: "api_key",
            apiKeyId: key.id,
          };
          if (req.method !== "GET" && req.method !== "HEAD" && !key.scopes.includes("write") && !key.scopes.includes("admin")) {
            throw ApiError.forbidden("This API key is read-only");
          }
        } else {
          throw ApiError.unauthorized("Unrecognised bearer token");
        }
      } else {
        user = await getCurrentUser();
        if (!user) throw ApiError.unauthorized();
        await rateLimit(`user:${user.id}${bucket}`, rl.limit, rl.windowSec);
        // CSRF: cookie-authenticated mutations must come from our own origin.
        if (req.method !== "GET" && req.method !== "HEAD") {
          const origin = req.headers.get("origin");
          const host = req.headers.get("host");
          if (origin && host && new URL(origin).host !== host) throw ApiError.forbidden("Cross-origin request rejected");
        }
      }
      await rateLimit(`ip:${ipKey}${bucket}`, rl.limit * 4, rl.windowSec);

      if (options.workspaceParam !== false) {
        const paramName = options.workspaceParam ?? "workspace";
        const slugOrId = params[paramName] ?? req.nextUrl.searchParams.get("workspace") ?? undefined;
        if (ctx) {
          if (slugOrId && slugOrId !== ctx.workspaceSlug && slugOrId !== ctx.workspaceId) {
            throw ApiError.forbidden("API key does not belong to this workspace");
          }
        } else {
          if (!slugOrId) throw ApiError.invalid("workspace is required");
          ctx = await workspaceContextForUser(user!, slugOrId);
        }
      }

      let body: TBody = undefined as TBody;
      if (options.body) {
        const raw = req.headers.get("content-type")?.includes("application/json") ? await req.json().catch(() => ({})) : {};
        body = options.body.parse(raw);
      }
      let query: TQuery = undefined as TQuery;
      if (options.query) {
        query = options.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }

      const result = await fn({
        req,
        requestId,
        user,
        ctx: ctx ?? { workspaceId: "", workspaceSlug: "", userId: user?.id ?? null, role: "member", requestId, actorType: "user" },
        body,
        query,
        params,
      });
      const res = result instanceof Response ? result : NextResponse.json(result);
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status >= 500) {
        logger.error({ err, requestId, path: req.nextUrl.pathname }, "api error");
      }
      return toErrorResponse(err, requestId);
    } finally {
      logger.debug({ requestId, path: req.nextUrl.pathname, ms: Date.now() - started }, "api request");
    }
  };
}
