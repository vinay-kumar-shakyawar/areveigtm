import { z } from "zod";

export const STEP_KINDS = ["linkedin_connect", "linkedin_message", "linkedin_inmail", "linkedin_engage", "email", "x_dm", "x_engage", "wait", "branch", "manual_task"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const CHANNEL_OF_KIND: Record<StepKind, "linkedin" | "email" | "x" | "none"> = {
  linkedin_connect: "linkedin",
  linkedin_message: "linkedin",
  linkedin_inmail: "linkedin",
  linkedin_engage: "linkedin",
  email: "email",
  x_dm: "x",
  x_engage: "x",
  wait: "none",
  branch: "none",
  manual_task: "none",
};

export const aiGenerationSchema = z.object({
  enabled: z.boolean().default(true),
  tone: z.enum(["plain", "friendly", "direct", "formal"]).default("plain"),
  length: z.enum(["short", "medium"]).default("short"),
  instructions: z.string().max(1500).optional().describe("Extra guidance for this step, e.g. 'reference the hiring signal if present'"),
});

export const stepInput = z.object({
  kind: z.enum(STEP_KINDS),
  delayDays: z.number().int().min(0).max(30).default(0),
  subject: z.string().max(200).nullable().optional(),
  bodyTemplate: z.string().max(8000).nullable().optional().describe("Used when AI generation is off; supports {{firstName}} {{lastName}} {{fullName}} {{company}} {{title}} {{senderFirstName}}"),
  variants: z.array(z.object({ key: z.string().min(1).max(5), weight: z.number().int().min(1).max(10000), bodyTemplate: z.string().max(8000) })).max(10).optional(),
  condition: z.enum(["linkedin_accepted", "x_followed_back", "has_email", "has_linkedin", "has_x"]).nullable().optional(),
  actions: z.array(z.object({ type: z.enum(["view_profile", "like_last_post", "follow", "unfollow"]), count: z.number().int().min(1).max(3).default(1) })).max(5).optional(),
  aiGeneration: aiGenerationSchema.optional(),
  manualInstructions: z.string().max(2000).optional(),
});
export type StepInput = z.infer<typeof stepInput>;
export type StepInputRaw = z.input<typeof stepInput>;

export const sequenceInput = z.object({
  name: z.string().trim().min(1).max(160),
  executionModel: z.enum(["linear", "tracks"]).default("linear"),
  steps: z.array(stepInput).min(1).max(20),
  stopRules: z.object({ onReply: z.boolean().default(true), onOptOut: z.boolean().default(true), onBounce: z.boolean().default(true), onInvalidContact: z.boolean().default(true) }).optional(),
  emailSettings: z.object({ mailboxIds: z.array(z.string().uuid()).optional(), dailyLimit: z.number().int().min(1).max(5000).optional(), unsubscribeFooter: z.boolean().optional() }).optional(),
  isTemplate: z.boolean().optional(),
});
export type SequenceInput = z.infer<typeof sequenceInput>;

export const TEMPLATE_VARIABLES = ["firstName", "lastName", "fullName", "company", "title", "senderFirstName"] as const;

/** Validation beyond the shape: ordering rules that make a sequence executable. */
export function validateSteps(steps: StepInput[], executionModel: "linear" | "tracks"): string[] {
  const errors: string[] = [];
  const firstEmail = steps.findIndex((s) => s.kind === "email");
  if (firstEmail >= 0 && !steps[firstEmail].subject?.trim() && !(steps[firstEmail].aiGeneration?.enabled ?? true)) {
    errors.push(`Step ${firstEmail + 1}: the first email needs a subject (or enable AI generation).`);
  }
  steps.forEach((s, i) => {
    const ai = s.aiGeneration?.enabled ?? true;
    const needsBody = ["linkedin_message", "linkedin_inmail", "email", "x_dm"].includes(s.kind);
    if (needsBody && !ai && !s.bodyTemplate?.trim() && !s.variants?.length) errors.push(`Step ${i + 1}: add a message body or enable AI generation.`);
    if (s.kind === "linkedin_message" || s.kind === "linkedin_inmail") {
      const connectBefore = steps.slice(0, i).some((p) => p.kind === "linkedin_connect");
      if (s.kind === "linkedin_message" && !connectBefore && executionModel === "linear") errors.push(`Step ${i + 1}: a LinkedIn message needs a connection request earlier in the sequence.`);
    }
    if (s.kind === "linkedin_connect" && (s.bodyTemplate?.length ?? 0) > 300) errors.push(`Step ${i + 1}: connection notes are limited to 300 characters.`);
    if (s.kind === "manual_task" && !s.manualInstructions?.trim()) errors.push(`Step ${i + 1}: describe the manual task.`);
    if ((s.kind === "linkedin_engage" || s.kind === "x_engage") && !s.actions?.length) errors.push(`Step ${i + 1}: choose at least one engagement action.`);
  });
  if (steps.filter((s) => s.kind === "linkedin_connect").length > 1) errors.push("Only one connection request per sequence.");
  return errors;
}

/** Render {{variables}}; unknown variables are left blank, never hallucinated. */
export function renderTemplate(template: string, vars: Partial<Record<(typeof TEMPLATE_VARIABLES)[number] | string, string | null | undefined>>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key: string) => (vars[key] ?? "").toString());
}
