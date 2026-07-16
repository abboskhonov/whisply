import * as React from "react"
import { useLocation } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Titlebar } from "@/components/titlebar"
import { useDictation } from "@/hooks/use-dictation"

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/insights": "Insights",
  "/logs": "Logs",
  "/dictionary": "Dictionary",
  "/snippets": "Snippets",
  "/style": "Style",
  "/settings": "Settings",
  "/settings/general": "General",
  "/settings/dictation": "Dictation",
  "/settings/models": "Models",
  "/settings/shortcut": "Shortcuts",
  "/settings/text-insertion": "Text Insertion",
  "/settings/appearance": "Appearance",
  "/settings/advanced": "Advanced",
  "/settings/about": "About",
}

function useRouteTitle() {
  const location = useLocation()
  if (location.pathname in ROUTE_TITLES) {
    return ROUTE_TITLES[location.pathname]
  }
  return "Whisply"
}

type AppShellHeaderProps = {
  title?: string
  actions?: React.ReactNode
  className?: string
}

export function AppShellHeader({
  title,
  actions,
  className,
}: AppShellHeaderProps) {
  const routeTitle = useRouteTitle()
  return (
    <header
      data-ui-scroll-ignore
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13.5px] font-medium text-foreground/90">
          {title ?? routeTitle}
        </span>
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

type LayoutProps = React.ComponentProps<typeof SidebarProvider> & {
  children: React.ReactNode
  header?: AppShellHeaderProps
}

export function Layout({
  children,
  header,
  className,
  ...providerProps
}: LayoutProps) {
  // The hook is currently a passive observer; we still call it so the
  // shortcut is re-registered on mount and the state is tracked in case
  // a future consumer wants to display an in-app status pill.
  useDictation()

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <Titlebar />
      <SidebarProvider
        defaultOpen={true}
        className={cn("min-h-0 flex-1", className)}
        {...providerProps}
      >
        <AppSidebar />
        <SidebarInset>
          <AppShellHeader {...(header ?? {})} />
          <div
            data-ui-scroll-container
            className="flex min-h-0 flex-1 flex-col bg-background"
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
