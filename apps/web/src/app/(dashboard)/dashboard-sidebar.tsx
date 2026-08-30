"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  AiBrain01Icon,
  DatabaseBackupIcon,
  Folder02Icon,
  GithubIcon,
  GlobeIcon,
  HardDriveIcon,
  HistoryIcon,
  Home01Icon,
  Logout01Icon,
  Notification03Icon,
  Rocket01Icon,
  ServerStack02Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/app/providers";
import { initialsOf } from "@/lib/initials";
import { logoutAction } from "./logout-action";
import { PlatformUpdateDialog } from "./platform-update-dialog";

const NAV_LINK_CLASS = "h-10 text-[15px]";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: Home01Icon },
  { href: "/projects", label: "Projects", icon: Folder02Icon },
  { href: "/settings/monitoring", label: "Monitoring", icon: Activity03Icon },
  { href: "/settings/users", label: "Users", icon: UserGroupIcon },
  { href: "/settings/github", label: "GitHub", icon: GithubIcon },
  { href: "/settings/servers", label: "Servers", icon: ServerStack02Icon },
  { href: "/settings/backups", label: "Backups", icon: DatabaseBackupIcon },
  { href: "/settings/notifications", label: "Notifications", icon: Notification03Icon },
  { href: "/settings/ai-providers", label: "AI providers", icon: AiBrain01Icon },
  { href: "/settings/disk-usage", label: "Disk usage", icon: HardDriveIcon },
  { href: "/settings/dashboard-domain", label: "Dashboard domain", icon: GlobeIcon },
  { href: "/settings/audit-log", label: "Audit log", icon: HistoryIcon },
];

const PROFILE_LINK = { href: "/settings/profile", label: "Profile", icon: UserIcon };

export function DashboardSidebar() {
  const pathname = usePathname();
  const profileActive = pathname === PROFILE_LINK.href || pathname.startsWith(`${PROFILE_LINK.href}/`);
  const profile = trpc.profile.get.useQuery();

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const platformUpdate = trpc.platformUpdate.status.useQuery(undefined, {
    // Slow background poll - a real check only happens hourly agent-side
    // anyway (see check-platform-update.ts), this just picks up that result.
    refetchInterval: 5 * 60_000,
  });
  const isRunning = platformUpdate.data?.updateStatus === "running";
  const updateAvailable = platformUpdate.data?.updateAvailable ?? false;

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <div className="flex items-center px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="group-data-[collapsible=icon]:hidden">
            <Image src="/logos/brand/openploy-logo.png" alt="Openploy" width={120} height={28} className="h-7 w-auto dark:hidden" priority />
            <Image
              src="/logos/brand/openploy-logo-light.png"
              alt="Openploy"
              width={120}
              height={28}
              className="hidden h-7 w-auto dark:block"
              priority
            />
          </div>
          <div className="hidden group-data-[collapsible=icon]:block">
            <Image src="/logos/brand/openploy-favicon.png" alt="Openploy" width={24} height={24} className="size-7 dark:hidden" />
            <Image
              src="/logos/brand/openploy-favicon-light.png"
              alt="Openploy"
              width={24}
              height={24}
              className="hidden size-7 dark:block"
            />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton href={link.href} isActive={active} tooltip={link.label} className={NAV_LINK_CLASS}>
                      <HugeiconsIcon icon={link.icon} size={18} strokeWidth={2} />
                      <span>{link.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              href={PROFILE_LINK.href}
              isActive={profileActive}
              tooltip={PROFILE_LINK.label}
              size="lg"
            >
              {profile.data ? (
                <>
                  <Avatar size="sm" className="group-data-[collapsible=icon]:size-8">
                    <AvatarImage src={`/api/users/${profile.data.id}/avatar`} alt={profile.data.name} />
                    <AvatarFallback className="bg-foreground/[0.06] text-xs font-semibold text-foreground/80">
                      {initialsOf(profile.data.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-medium">{profile.data.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{profile.data.email}</span>
                  </div>
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={PROFILE_LINK.icon} size={18} strokeWidth={2} />
                  <span>{PROFILE_LINK.label}</span>
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={isRunning ? "Updating..." : updateAvailable ? "Update available" : "Platform update"}
              className={NAV_LINK_CLASS}
              onClick={() => setUpdateDialogOpen(true)}
            >
              {isRunning ? <Spinner className="size-[18px]" /> : <HugeiconsIcon icon={Rocket01Icon} size={18} strokeWidth={2} />}
              <span>{isRunning ? "Updating..." : updateAvailable ? "Update available" : "Platform update"}</span>
            </SidebarMenuButton>
            {updateAvailable && !isRunning && <SidebarMenuBadge className="size-2 min-w-0 rounded-full bg-amber-500 p-0" />}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logoutAction}>
              <SidebarMenuButton type="submit" tooltip="Log out" className={NAV_LINK_CLASS}>
                <HugeiconsIcon icon={Logout01Icon} size={18} strokeWidth={2} />
                <span>Log out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      {updateDialogOpen && (
        <PlatformUpdateDialog onOpenChange={setUpdateDialogOpen} isOwner={profile.data?.role === "owner"} />
      )}
    </Sidebar>
  );
}
