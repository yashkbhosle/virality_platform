"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Film, Play, Users, Settings2, Search, Eye, Zap, FileText, TrendingUp,
  Compass, UserCircle2, BookOpen, LineChart, LogOut, type LucideIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { PersonaSwitcher } from "@/components/persona-switcher";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Research",
    items: [
      { title: "Keyword Research", href: "/keyword-research", icon: Search, color: "text-red-400" },
      { title: "Discover Creators", href: "/discover", icon: Compass, color: "text-orange-400" },
      { title: "Watchlist", href: "/watchlist", icon: Eye, color: "text-blue-400" },
      { title: "Videos", href: "/videos", icon: Film, color: "text-purple-400" },
    ],
  },
  {
    label: "Create",
    items: [
      { title: "Persona", href: "/persona", icon: UserCircle2, color: "text-violet-400" },
      { title: "Hook Generator", href: "/hook-generator", icon: Zap, color: "text-yellow-400" },
      { title: "Hook Library", href: "/hook-library", icon: BookOpen, color: "text-amber-400" },
      { title: "Script Writer", href: "/script-writer", icon: FileText, color: "text-green-400" },
    ],
  },
  {
    label: "Track",
    items: [{ title: "My Channel", href: "/my-channel", icon: LineChart, color: "text-emerald-400" }],
  },
  {
    label: "System",
    items: [
      { title: "Run Pipeline", href: "/run", icon: Play, color: "text-indigo-400" },
      { title: "Creators", href: "/creators", icon: Users, color: "text-cyan-400" },
      { title: "Configs", href: "/configs", icon: Settings2, color: "text-muted-foreground" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r border-white/[0.06]">
      <SidebarHeader className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/25">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Virality OS</h1>
            <p className="text-[11px] text-muted-foreground">Content Intelligence</p>
          </div>
        </div>
        <PersonaSwitcher />
      </SidebarHeader>

      <SidebarContent className="px-3 space-y-1">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-3 mb-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} className="h-10 rounded-xl px-3 transition-all duration-200">
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className={`h-4 w-4 ${isActive ? item.color : "text-muted-foreground"}`} />
                          <span className="text-[13px]">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-5 py-4">
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
            window.location.assign("/login");
          }}
          className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
        <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 p-3">
          <p className="text-[11px] font-semibold text-violet-600 dark:text-violet-300">Success Tales Media</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Content Intelligence Platform</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
