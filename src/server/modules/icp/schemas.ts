import { z } from "zod";

export const SENIORITIES = ["Owner / Founder", "C-level", "VP", "Director", "Head", "Manager", "Senior IC", "IC"] as const;
export const FUNCTIONS = ["Executive", "Sales", "Marketing", "Growth", "Product", "Engineering", "Operations", "Finance", "HR / People", "Customer Success", "Legal", "Data", "Other"] as const;

const range = z.object({ min: z.number().int().min(0).nullable(), max: z.number().int().min(0).nullable() });

/**
 * Structured ICP criteria, version 1. Produced by the AI from plain language
 * and editable by hand. Every list is optional; empty means "no constraint".
 */
export const icpCriteriaV1 = z.object({
  version: z.literal(1).default(1),
  titles: z.array(z.string().min(1).max(80)).max(40).default([]).describe("Job title phrases to match, e.g. 'Head of Marketing'"),
  excludeTitles: z.array(z.string().min(1).max(80)).max(40).default([]),
  seniorities: z.array(z.enum(SENIORITIES)).default([]),
  functions: z.array(z.enum(FUNCTIONS)).default([]),
  industries: z.array(z.string().min(1).max(80)).max(30).default([]),
  excludeIndustries: z.array(z.string().min(1).max(80)).max(30).default([]),
  geographies: z.array(z.string().min(1).max(80)).max(30).default([]).describe("Countries, regions or cities"),
  countries: z.array(z.string().length(2)).max(60).default([]).describe("ISO 3166-1 alpha-2 codes derived from geographies"),
  companySize: range.default({ min: null, max: null }).describe("Employee headcount"),
  revenue: range.default({ min: null, max: null }).describe("Annual revenue in USD, when known"),
  technologies: z.array(z.string().min(1).max(80)).max(40).default([]),
  companyCharacteristics: z.array(z.string().min(1).max(160)).max(20).default([]).describe("Qualitative traits, e.g. 'sells direct to consumers online'"),
  exclusions: z.array(z.string().min(1).max(160)).max(20).default([]).describe("Who to avoid, e.g. 'agencies', 'companies already using a competitor we cannot replace'"),
  buyingSignals: z.array(z.string().min(1).max(160)).max(20).default([]).describe("Events that make a company a good target now"),
  preferredChannels: z.array(z.enum(["email", "linkedin", "x"])).default([]),
  keywords: z.array(z.string().min(1).max(80)).max(30).default([]),
});
export type IcpCriteriaV1 = z.infer<typeof icpCriteriaV1>;

export const icpExtractionSchema = z.object({
  name: z.string().min(1).max(80).describe("Short, memorable name for this ICP"),
  criteria: icpCriteriaV1,
  rationale: z.string().max(1500).describe("Why these criteria follow from the description and the company profile"),
  ambiguities: z.array(z.string().max(200)).describe("Anything in the description that could be read several ways"),
});
export type IcpExtraction = z.infer<typeof icpExtractionSchema>;

export const icpInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).nullable().optional(),
  criteria: icpCriteriaV1,
  status: z.enum(["draft", "active", "archived"]).optional(),
  isDefault: z.boolean().optional(),
});
export type IcpInput = z.infer<typeof icpInput>;
