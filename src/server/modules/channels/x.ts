import "server-only";
import type { Message, SenderAccount, EmailMailbox } from "@prisma/client";
import type { Ctx } from "@/server/auth/context";
import { resolveProviders } from "@/server/providers/registry";
import type { XProvider } from "@/server/providers/types";

type Sender = (SenderAccount & { mailbox: EmailMailbox | null }) | null;

/** X DMs go through the official API adapter bound to a connected account, or become manual tasks. */
export async function sendXMessage(ctx: Ctx, message: Message, sender: Sender): Promise<{ providerMessageId: string; threadKey?: string } | { manual: true }> {
  if (!sender || sender.channel !== "x" || sender.status !== "connected") return { manual: true };
  const providers = await resolveProviders<XProvider>(ctx.workspaceId, "x.dm", { preferProvider: sender.provider, usage: { leadId: message.leadId ?? undefined } });
  const provider = providers.find((p) => p.descriptor.id === sender.provider);
  if (!provider || !message.toAddress) return { manual: true };
  const user = await provider.instance.resolveHandle(message.toAddress);
  if (!user) throw new Error(`X handle @${message.toAddress} could not be resolved`);
  const res = await provider.instance.sendDm({ recipientUserId: user.userId, text: message.body });
  return { providerMessageId: res.providerRef, threadKey: `x:${user.userId}` };
}
