import "server-only";
import { prisma } from "@/server/db/client";
import { env } from "@/lib/env";
import { openJson } from "@/server/vault";
import { ApiError } from "@/server/api/errors";
import { logger } from "@/server/logger";
import type {
  AnyProviderInstance,
  Capability,
  ProviderCategory,
  ProviderDescriptor,
  ProviderError,
  UsageRecord,
} from "@/server/providers/types";
import { anthropicDescriptor } from "@/server/providers/llm/anthropic";
import { openAiCompatibleDescriptors } from "@/server/providers/llm/openai-compatible";
import { geminiDescriptor } from "@/server/providers/llm/gemini";
import { bedrockDescriptor } from "@/server/providers/llm/bedrock";
import { apolloDescriptor } from "@/server/providers/people/apollo";
import { pdlDescriptor } from "@/server/providers/people/pdl";
import { hunterDescriptor } from "@/server/providers/people/hunter";
import { snovDescriptor } from "@/server/providers/people/snov";
import { exaDescriptor } from "@/server/providers/company/exa";
import { firecrawlDescriptor } from "@/server/providers/company/firecrawl";
import { builtinFetchDescriptor } from "@/server/providers/company/builtin-fetch";
import { mockDescriptors } from "@/server/providers/mock";
import { resendDescriptor } from "@/server/providers/email/resend";
import { sendgridDescriptor } from "@/server/providers/email/sendgrid";
import { sesDescriptor } from "@/server/providers/email/ses";
import { smtpImapDescriptor } from "@/server/providers/mailbox/imap-smtp";
import { googleMailboxDescriptor } from "@/server/providers/mailbox/google";
import { microsoftMailboxDescriptor } from "@/server/providers/mailbox/microsoft";
import { unipileDescriptor } from "@/server/providers/linkedin/unipile";
import { xApiDescriptor } from "@/server/providers/x/x-api";

type AnyDescriptor = ProviderDescriptor<Record<string, string>, Record<string, unknown>>;

const descriptors: AnyDescriptor[] = [
  anthropicDescriptor as unknown as AnyDescriptor,
  ...(openAiCompatibleDescriptors as unknown as AnyDescriptor[]),
  geminiDescriptor as unknown as AnyDescriptor,
  bedrockDescriptor as unknown as AnyDescriptor,
  apolloDescriptor as unknown as AnyDescriptor,
  pdlDescriptor as unknown as AnyDescriptor,
  hunterDescriptor as unknown as AnyDescriptor,
  snovDescriptor as unknown as AnyDescriptor,
  exaDescriptor as unknown as AnyDescriptor,
  firecrawlDescriptor as unknown as AnyDescriptor,
  builtinFetchDescriptor as unknown as AnyDescriptor,
  resendDescriptor as unknown as AnyDescriptor,
  sendgridDescriptor as unknown as AnyDescriptor,
  sesDescriptor as unknown as AnyDescriptor,
  smtpImapDescriptor as unknown as AnyDescriptor,
  googleMailboxDescriptor as unknown as AnyDescriptor,
  microsoftMailboxDescriptor as unknown as AnyDescriptor,
  unipileDescriptor as unknown as AnyDescriptor,
  xApiDescriptor as unknown as AnyDescriptor,
];

/** Later phases register channel descriptors (email, mailbox, linkedin, x) here. */
export function registerDescriptor(d: AnyDescriptor) {
  if (!descriptors.some((x) => x.id === d.id && x.category === d.category)) descriptors.push(d);
}

export function listDescriptors(options?: { includeMocks?: boolean }): AnyDescriptor[] {
  const includeMocks = options?.includeMocks ?? process.env.NODE_ENV !== "production";
  return includeMocks ? [...descriptors, ...(mockDescriptors as AnyDescriptor[])] : descriptors;
}

export function getDescriptor(category: ProviderCategory, id: string): AnyDescriptor {
  const d = listDescriptors({ includeMocks: true }).find((x) => x.category === category && x.id === id);
  if (!d) throw ApiError.invalid(`Unknown provider ${category}/${id}`);
  if (process.env.NODE_ENV === "production" && id === "mock") throw ApiError.invalid("Mock providers are not available in production");
  return d;
}

export interface ResolvedProvider<T extends AnyProviderInstance = AnyProviderInstance> {
  instance: T;
  descriptor: AnyDescriptor;
  integrationId: string | null;
  source: "workspace" | "system";
}

/**
 * Resolve every usable provider instance for a capability, in priority order:
 * workspace integrations (enabled, ordered by `priority`, default first), then
 * the system-level env provider when ALLOW_SYSTEM_PROVIDER_FALLBACK is set.
 */
export async function resolveProviders<T extends AnyProviderInstance = AnyProviderInstance>(
  workspaceId: string,
  capability: Capability,
  options?: { preferProvider?: string; usage?: UsageContext },
): Promise<ResolvedProvider<T>[]> {
  const candidates = listDescriptors().filter((d) => d.capabilities.includes(capability));
  const integrations = await prisma.integration.findMany({
    where: { workspaceId, enabled: true, category: { in: [...new Set(candidates.map((c) => c.category))] } },
    include: { credential: true },
    orderBy: [{ isDefault: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
  });
  const out: ResolvedProvider<T>[] = [];
  for (const integration of integrations) {
    const descriptor = candidates.find((d) => d.id === integration.provider && d.category === integration.category);
    if (!descriptor) continue;
    let credentials: Record<string, string> = {};
    if (descriptor.credentialFields.length > 0) {
      if (!integration.credential || integration.credential.revokedAt) continue;
      credentials = openJson<Record<string, string>>(
        { ciphertext: Buffer.from(integration.credential.ciphertext), iv: Buffer.from(integration.credential.iv), authTag: Buffer.from(integration.credential.authTag), keyVersion: integration.credential.keyVersion },
        `integration:${integration.id}`,
      );
    }
    const usage = usageSink(workspaceId, integration.id, descriptor.id, options?.usage);
    out.push({ instance: descriptor.create({ credentials, config: (integration.config as Record<string, unknown>) ?? {}, usage, integrationId: integration.id }) as T, descriptor, integrationId: integration.id, source: "workspace" });
  }
  if (options?.preferProvider) out.sort((a, b) => (a.descriptor.id === options.preferProvider ? -1 : b.descriptor.id === options.preferProvider ? 1 : 0));

  if (env().ALLOW_SYSTEM_PROVIDER_FALLBACK || out.length === 0) {
    for (const descriptor of candidates) {
      if (out.some((o) => o.descriptor.id === descriptor.id)) continue;
      if (descriptor.id === "mock") continue;
      if (!descriptor.credentialsFromEnv && descriptor.credentialFields.length === 0) {
        // Keyless provider (built-in fetcher): always available as a last resort.
        out.push({ instance: descriptor.create({ credentials: {}, config: {}, usage: usageSink(workspaceId, null, descriptor.id, options?.usage) }) as T, descriptor, integrationId: null, source: "system" });
        continue;
      }
      if (!env().ALLOW_SYSTEM_PROVIDER_FALLBACK) continue;
      const creds = descriptor.credentialsFromEnv?.(process.env as Record<string, string | undefined>);
      if (!creds) continue;
      out.push({ instance: descriptor.create({ credentials: creds, config: {}, usage: usageSink(workspaceId, null, descriptor.id, options?.usage) }) as T, descriptor, integrationId: null, source: "system" });
    }
  }
  return out;
}

export async function resolveProvider<T extends AnyProviderInstance = AnyProviderInstance>(
  workspaceId: string,
  capability: Capability,
  options?: { preferProvider?: string; usage?: UsageContext },
): Promise<ResolvedProvider<T>> {
  const all = await resolveProviders<T>(workspaceId, capability, options);
  if (all.length === 0) {
    throw new ApiError("not_configured", `No provider is configured for ${capability}. Add one under Integrations.`, { details: { capability } });
  }
  return all[0];
}

/**
 * Run an operation against providers in order, falling back on retryable
 * provider errors (rate limit, outage). Auth and quota errors do not fall back
 * silently: they are surfaced with the provider name so the user can fix keys.
 */
export async function withFallback<T extends AnyProviderInstance, R>(
  workspaceId: string,
  capability: Capability,
  run: (p: ResolvedProvider<T>) => Promise<R>,
  options?: { preferProvider?: string; usage?: UsageContext },
): Promise<{ result: R; provider: ResolvedProvider<T> }> {
  const providers = await resolveProviders<T>(workspaceId, capability, options);
  if (providers.length === 0) throw new ApiError("not_configured", `No provider is configured for ${capability}. Add one under Integrations.`, { details: { capability } });
  let lastError: unknown;
  for (const p of providers) {
    try {
      const result = await run(p);
      return { result, provider: p };
    } catch (err) {
      lastError = err;
      const pe = err as ProviderError;
      if (pe && typeof pe === "object" && "retryable" in pe && pe.retryable) {
        logger.warn({ provider: p.descriptor.id, capability, err: pe.message }, "provider failed; trying next");
        await markHealth(p.integrationId, false, pe.message);
        continue;
      }
      if (pe && typeof pe === "object" && "code" in pe && (pe as ProviderError).code === "auth") {
        await markHealth(p.integrationId, false, pe.message);
      }
      throw toApiError(err, p.descriptor.id);
    }
  }
  throw toApiError(lastError, providers[providers.length - 1].descriptor.id);
}

export function toApiError(err: unknown, providerId: string): ApiError {
  if (err instanceof ApiError) return err;
  const pe = err as Partial<ProviderError> & { message?: string };
  const code = pe?.code;
  if (code === "auth") return new ApiError("provider_error", `${providerId}: authentication failed. Check the API key under Integrations.`, { retryable: false });
  if (code === "quota") return new ApiError("provider_error", `${providerId}: quota or credits exhausted.`, { retryable: false });
  if (code === "rate_limited") return new ApiError("provider_error", `${providerId}: rate limited. Try again shortly.`, { retryable: true });
  if (code === "invalid_request") return new ApiError("provider_error", `${providerId}: ${pe.message ?? "invalid request"}`, { retryable: false });
  return new ApiError("provider_error", `${providerId}: ${pe?.message ?? "unavailable"}`, { retryable: true });
}

async function markHealth(integrationId: string | null, ok: boolean, message?: string) {
  if (!integrationId) return;
  await prisma.integration
    .update({ where: { id: integrationId }, data: { healthStatus: ok ? "healthy" : "degraded", lastHealthCheckAt: new Date(), lastError: ok ? undefined : { message } } })
    .catch(() => {});
}

export interface UsageContext {
  leadId?: string;
  campaignId?: string;
  requestId?: string;
}

function usageSink(workspaceId: string, integrationId: string | null, provider: string, ctx?: UsageContext) {
  return (u: UsageRecord) => {
    prisma.providerUsage
      .create({
        data: {
          workspaceId,
          integrationId: integrationId ?? undefined,
          provider,
          operation: u.operation,
          units: u.units,
          unitLabel: u.unitLabel,
          estimatedCostCents: u.estimatedCostCents ?? 0,
          leadId: ctx?.leadId,
          campaignId: ctx?.campaignId,
          requestId: ctx?.requestId,
          metadata: u.metadata as object | undefined,
        },
      })
      .catch((err) => logger.warn({ err }, "failed to record provider usage"));
  };
}
