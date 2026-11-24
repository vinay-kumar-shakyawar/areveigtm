import type { EmailSendProvider, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";

/** Amazon SES v2 adapter via the AWS SDK. */
interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
}
interface Config {
  region?: string;
}

function createSes(creds: Creds, config: Config, usage: UsageSink): EmailSendProvider {
  const region = config.region || "us-east-1";
  async function client() {
    const { SESv2Client } = await import("@aws-sdk/client-sesv2");
    return new SESv2Client({ region, credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey } });
  }
  function mapError(err: unknown): ProviderError {
    const name = (err as { name?: string }).name ?? "";
    const code = /AccessDenied|UnrecognizedClient|InvalidSignature|InvalidClientTokenId/.test(name) ? "auth" : /Throttling|TooManyRequests/.test(name) ? "rate_limited" : /MessageRejected|BadRequest|Validation/.test(name) ? "invalid_request" : "unavailable";
    return new ProviderError("ses", code, (err as Error).message);
  }
  return {
    id: "ses",
    category: "email",
    async testConnection() {
      const started = Date.now();
      try {
        const { GetAccountCommand } = await import("@aws-sdk/client-sesv2");
        const res = await (await client()).send(new GetAccountCommand({}));
        return { ok: true, message: `Connected (${region}). ${res.ProductionAccessEnabled ? "Production access" : "Sandbox mode"}; sending enabled: ${res.SendingEnabled}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: mapError(err).message, latencyMs: Date.now() - started };
      }
    },
    async send(email) {
      try {
        const { SendEmailCommand } = await import("@aws-sdk/client-sesv2");
        const res = await (await client()).send(
          new SendEmailCommand({
            FromEmailAddress: email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email,
            Destination: { ToAddresses: [email.to.email] },
            ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
            Content: {
              Simple: {
                Subject: { Data: email.subject },
                Body: { Text: { Data: email.text }, ...(email.html ? { Html: { Data: email.html } } : {}) },
                Headers: Object.entries({ ...(email.headers ?? {}), ...(email.inReplyTo ? { "In-Reply-To": email.inReplyTo, References: (email.references ?? [email.inReplyTo]).join(" ") } : {}) }).map(([Name, Value]) => ({ Name, Value })),
              },
            },
          }),
        );
        usage({ operation: "email.send", units: 1, unitLabel: "emails", estimatedCostCents: 0 });
        return { providerMessageId: res.MessageId ?? `ses:${Date.now()}`, accepted: true };
      } catch (err) {
        throw mapError(err);
      }
    },
    async getDomainStatus(domain) {
      try {
        const { GetEmailIdentityCommand } = await import("@aws-sdk/client-sesv2");
        const res = await (await client()).send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
        return { verified: Boolean(res.VerifiedForSendingStatus), dkim: res.DkimAttributes?.Status === "SUCCESS", spf: undefined, dmarc: undefined, details: { identityType: res.IdentityType, dkimStatus: res.DkimAttributes?.Status } };
      } catch (err) {
        return { verified: false, details: { message: mapError(err).message } };
      }
    },
  };
}

export const sesDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "ses",
  category: "email",
  displayName: "Amazon SES",
  description: "High-volume email through your AWS account.",
  docsUrl: "https://docs.aws.amazon.com/ses/",
  capabilities: ["email.send"],
  credentialFields: [
    { key: "accessKeyId", label: "AWS access key ID", type: "text", required: true },
    { key: "secretAccessKey", label: "AWS secret access key", type: "secret", required: true },
  ],
  configFields: [{ key: "region", label: "Region", type: "text", default: "us-east-1" }],
  systemEnvKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  credentialsFromEnv: (env) => (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } : null),
  create: ({ credentials, config, usage }) => createSes(credentials, config, usage),
};
