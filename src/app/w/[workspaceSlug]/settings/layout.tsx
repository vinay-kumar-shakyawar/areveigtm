import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout(props: LayoutProps<"/w/[workspaceSlug]/settings">) {
  const { workspaceSlug } = await props.params;
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <SettingsNav base={`/w/${workspaceSlug}/settings`} />
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}
