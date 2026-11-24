import { requireWorkspaceContext } from "@/server/auth/context";
import { getCompanyProfile } from "@/server/modules/company/service";
import { can } from "@/server/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { CompanyEditor } from "./company-editor";
import type { CompanyDraft } from "@/server/modules/company/schemas";

export const metadata = { title: "Company profile" };

export default async function CompanyPage(props: PageProps<"/w/[workspaceSlug]/company">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  const profile = await getCompanyProfile(ctx);
  return (
    <>
      <PageHeader
        title="Company profile"
        description="This is the knowledge base every AI task reads: ICP extraction, lead research, scoring and outreach. Analyse your website for a grounded draft, edit, then approve."
      />
      <CompanyEditor
        slug={workspaceSlug}
        canEdit={can(ctx.role, "company.update")}
        profile={{
          companyName: profile.companyName ?? "",
          website: profile.website ?? "",
          description: profile.description ?? "",
          productOrService: profile.productOrService ?? "",
          industry: profile.industry ?? "",
          businessModel: profile.businessModel ?? "",
          targetGeography: profile.targetGeography,
          targetCustomerType: profile.targetCustomerType ?? "",
          valueProposition: profile.valueProposition ?? "",
          competitors: (profile.competitors as { name: string; website?: string | null }[]) ?? [],
          existingCustomers: (profile.existingCustomers as { name: string; website?: string | null }[]) ?? [],
          preferredChannels: profile.preferredChannels as ("email" | "linkedin" | "x")[],
          salesObjective: profile.salesObjective ?? "",
          revision: profile.revision,
          approvedAt: profile.approvedAt?.toISOString() ?? null,
        }}
        draft={(profile.aiDraft as (CompanyDraft & { generatedAt?: string; provider?: string; model?: string }) | null) ?? null}
        draftSources={(profile.aiDraftSources as { url: string; title: string | null }[] | null) ?? []}
      />
    </>
  );
}
