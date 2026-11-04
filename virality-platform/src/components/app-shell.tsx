"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";

/** Sidebar + top bar for the app; the login page renders on its own. */
export function AppShell({ children }: { children: React.ReactNode }) {
  if (usePathname() === "/login") return <>{children}</>;
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto min-h-screen">
        <TopBar />
        <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">{children}</div>
      </main>
    </SidebarProvider>
  );
}
