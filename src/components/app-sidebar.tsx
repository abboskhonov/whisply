import * as React from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"

import { Sidebar, SidebarHeader } from "@/components/ui/sidebar"
import { AppBrand } from "@/components/nav-header"
import { SidebarNav } from "@/components/sidebar-nav"
import { SettingsSidebarPanel } from "@/components/settings-nav"
import { SidebarFooterNav } from "@/components/nav-footer"

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const isSettingsRoute = location.pathname.startsWith("/settings")
  const [settingsOpen, setSettingsOpen] = React.useState(isSettingsRoute)

  // Sync sidebar panel with route changes
  React.useEffect(() => {
    setSettingsOpen(isSettingsRoute)
  }, [isSettingsRoute])

  const toggle = React.useCallback(() => {
    if (settingsOpen) {
      setSettingsOpen(false)
      navigate({ to: "/" })
    } else {
      setSettingsOpen(true)
      navigate({ to: "/settings/general" })
    }
  }, [settingsOpen, navigate])

  return (
    <Sidebar variant="sidebar" collapsible="none" className="border-r-0">
      <SidebarHeader className="p-2 pb-1">
        {settingsOpen ? null : <AppBrand />}
      </SidebarHeader>
      {settingsOpen ? <SettingsSidebarPanel /> : <SidebarNav />}
      <SidebarFooterNav isOpen={settingsOpen} onToggle={toggle} />
    </Sidebar>
  )
}
