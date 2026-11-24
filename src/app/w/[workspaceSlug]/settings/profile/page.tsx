import { requireWorkspaceContext } from "@/server/auth/context";
import { PageHeader } from "@/components/app/page-header";
import { ProfileForms } from "./profile-forms";

export default async function ProfilePage(props: PageProps<"/w/[workspaceSlug]/settings/profile">) {
  const { workspaceSlug } = await props.params;
  const { user } = await requireWorkspaceContext(workspaceSlug);
  return (
    <>
      <PageHeader title="Your profile" description="Name and password for your account." />
      <ProfileForms slug={workspaceSlug} name={user.name ?? ""} email={user.email} />
    </>
  );
}
