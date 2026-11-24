import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "rate_limited"
  | "not_configured"
  | "provider_error"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  revision_conflict: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  not_configured: 422,
  provider_error: 502,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(code: ApiErrorCode, message: string, options?: { details?: unknown; retryable?: boolean }) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = options?.details;
    this.retryable = options?.retryable ?? (code === "rate_limited" || code === "provider_error");
  }

  static notFound(resource: string): ApiError {
    return new ApiError("not_found", `${resource} not found`, { details: { resource } });
  }
  static forbidden(message = "You do not have access to this resource"): ApiError {
    return new ApiError("forbidden", message);
  }
  static unauthorized(message = "Sign in required"): ApiError {
    return new ApiError("unauthorized", message);
  }
  static invalid(message: string, details?: unknown): ApiError {
    return new ApiError("invalid_request", message, { details });
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError("conflict", message, { details });
  }
}

export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    issues?: { path: string; message: string }[];
    details?: unknown;
  };
}

export function toErrorResponse(err: unknown, requestId?: string): NextResponse<ErrorEnvelope> {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "The request body failed validation",
          retryable: false,
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400, headers: requestId ? { "x-request-id": requestId } : undefined },
    );
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, retryable: err.retryable, details: err.details } },
      { status: err.status, headers: requestId ? { "x-request-id": requestId } : undefined },
    );
  }
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong", retryable: true } },
    { status: 500, headers: requestId ? { "x-request-id": requestId } : undefined },
  );
}
