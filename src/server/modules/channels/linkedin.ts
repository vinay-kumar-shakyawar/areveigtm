import "server-only";
import type { Message, SenderAccount, EmailMailbox } from "@prisma/client";
import type { Ctx } from "@/server/auth/context";
import { resolveProviders } from "@/server/providers/registry";
import type { LinkedInProvider } from "@/server/providers/types";
import type { StepKind } from "@/server/modules/sequences/schemas";

type Sender = (SenderAccount & { mailbox: EmailMailbox | null }) | null;

/**
 * LinkedIn actions run only through an authorized provider adapter bound to a
 * connected sender account. Without one, the step becomes a manual task.
 */
export async function sendLinkedInMessage(ctx: Ctx, message: Message, sender: Sender, kind: StepKind): Promise<{ providerMessageId: string; threadKey?: string } | { manual: true }> {
  if (!sender || sender.channel !== "linkedin" || sender.status !== "connected" || !sender.externalAccountId) return { manual: true };
  const providers = await resolveProviders<LinkedInProvider>(ctx.workspaceId, kind === "linkedin_connect" ? "linkedin.invite" : "linkedin.message", { preferProvider: sender.provider, usage: { leadId: message.leadId ?? undefined } });
  const provider = providers.find((p) => p.descriptor.id === sender.provider);
  if (!provider || !message.toAddress) return { manual: true };
  if (kind === "linkedin_connect") {
    const res = await provider.instance.sendInvitation({ accountId: sender.externalAccountId, linkedinUrl: message.toAddress, note: message.body || undefined });
    return { providerMessageId: res.providerRef };
  }
  const res = await provider.instance.sendMessage({ accountId: sender.externalAccountId, linkedinUrl: message.toAddress, text: message.body });
  return { providerMessageId: res.providerRef, threadKey: res.threadKey };
}
