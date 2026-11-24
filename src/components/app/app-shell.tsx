"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Plug,
  Radar,
  Settings,
  Target,
  Users,
  Plus,
  Check,
  LogOut,
  Menu,
} from "lucide-react";
import { startTransition, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/brand/logo";
import { GlobalSearch } from "@/components/app/global-search";
import { NotificationCenter } from "@/components/app/notifications";
import { signOutAction } from "@/app/(auth)/actions";

export interface ShellWorkspace {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
}

const NAV = [
  { href: "", label: "Dashboard", icon: LayoutDashboard },
  { href: "/company", label: "Company", icon: Building2 },
  { href: "/icps", label: "ICPs", icon: Target },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/signals", label: "Signals", icon: Radar },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  user,
  workspace,
  workspaces,
  unreadNotifications,
  children,
}: {
  user: { id: string; email: string; name: string | null };
  workspace: ShellWorkspace;
  workspaces: { slug: string; name: string }[];
  unreadNotifications: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = `/w/${workspace.slug}`;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Main navigation">
      {NAV.map((item) => (
        <NavLink key={item.href} href={`${base}${item.href}`} exact={item.href === ""} icon={item.icon} onNavigate={() => setMobileOpen(false)}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="px-4 py-4">
          <Link href={base}>
            <Logo />
          </Link>
        </div>
        <WorkspaceSwitcher current={workspace} all={workspaces} />
        <div className="mt-2 flex flex-1 flex-col">{nav}</div>
        <div className="border-t p-3 text-xs text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.name ?? user.email}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />}>
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-4 py-4">
                <Logo />
              </div>
              <WorkspaceSwitcher current={workspace} all={workspaces} />
              <div className="mt-2">{nav}</div>
            </SheetContent>
          </Sheet>
          <div className="flex-1">
            <GlobalSearch workspaceSlug={workspace.slug} />
          </div>
          <NotificationCenter workspaceSlug={workspace.slug} initialUnread={unreadNotifications} />
          <UserMenu user={user} base={base} />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  exact,
  icon: Icon,
  children,
  onNavigate,
}: {
  href: string;
  exact?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {children}
    </Link>
  );
}

function WorkspaceSwitcher({ current, all }: { current: ShellWorkspace; all: { slug: string; name: string }[] }) {
  return (
    <div className="px-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between" aria-label="Switch workspace" />}>
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {all.map((w) => (
              <DropdownMenuItem key={w.slug} render={<Link href={`/w/${w.slug}`} />} className="flex items-center justify-between">
                <span className="truncate">{w.name}</span>
                {w.slug === current.slug && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/workspaces/new" />}>
            <Plus className="size-4" /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function UserMenu({ user, base }: { user: { email: string; name: string | null }; base: string }) {
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />}>
        <Avatar className="size-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{user.name ?? "Account"}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`${base}/settings/profile`} />}>Profile</DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`${base}/settings`} />}>Workspace settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => startTransition(() => signOutAction())}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
