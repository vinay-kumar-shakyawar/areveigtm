import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { logger } from "@/server/logger";

export interface SystemEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Transactional email for the platform itself (sign-in codes, invitations).
 * Outbound campaign email goes through workspace providers, not this.
 */
export async function sendSystemEmail(mail: SystemEmail): Promise<void> {
  const e = env();
  switch (e.SYSTEM_EMAIL_PROVIDER) {
    case "console": {
      logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, "[system-mailer] console delivery");
      return;
    }
    case "smtp": {
      const transport = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT ?? 587,
        secure: e.SMTP_SECURE,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
      });
      await transport.sendMail({ from: e.SYSTEM_EMAIL_FROM, ...mail });
      return;
    }
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: e.SYSTEM_EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      });
      if (!res.ok) throw new Error(`Resend system email failed: ${res.status}`);
      return;
    }
    case "sendgrid": {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: mail.to }] }],
          from: parseFrom(e.SYSTEM_EMAIL_FROM),
          subject: mail.subject,
          content: [{ type: "text/plain", value: mail.text }, ...(mail.html ? [{ type: "text/html", value: mail.html }] : [])],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid system email failed: ${res.status}`);
      return;
    }
    case "ses": {
      const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
      const client = new SESv2Client({ region: e.AWS_REGION });
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: e.SYSTEM_EMAIL_FROM,
          Destination: { ToAddresses: [mail.to] },
          Content: {
            Simple: {
              Subject: { Data: mail.subject },
              Body: { Text: { Data: mail.text }, ...(mail.html ? { Html: { Data: mail.html } } : {}) },
            },
          },
        }),
      );
      return;
    }
  }
}

function parseFrom(from: string): { email: string; name?: string } {
  const m = /^(.*)<([^>]+)>$/.exec(from.trim());
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || undefined, email: m[2].trim() };
  return { email: from.trim() };
}
