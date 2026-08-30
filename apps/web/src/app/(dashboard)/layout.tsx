import { redirect } from "next/navigation";
import { getAuth } from "@/server/get-auth";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { InsecureConnectionBanner } from "@/components/insecure-connection-banner";
import { DashboardSidebar } from "./dashboard-sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();

  if (!auth) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <InsecureConnectionBanner />
      <DashboardSidebar />
      <SidebarInset>
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <SidebarTrigger />
          <ThemeToggle />
        </header>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
