import {
  BookmarkSimple,
  ChartLineUp,
  House,
  BookOpen,
  PaintBrush,
  Terminal,
} from "@phosphor-icons/react"
import { Link, useMatchRoute } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type IconLike = React.ComponentType<{
  className?: string
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
}>

type SidebarNavItem = {
  label: string
  to: string
  icon: IconLike
  tooltip?: string
}

type SidebarNavGroup = {
  label: string
  items: SidebarNavItem[]
}

const NAV_GROUPS: SidebarNavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Home", to: "/", icon: House, tooltip: "Home" },
      { label: "Insights", to: "/insights", icon: ChartLineUp, tooltip: "Insights" },
      { label: "Dictionary", to: "/dictionary", icon: BookOpen, tooltip: "Dictionary" },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Snippets", to: "/snippets", icon: BookmarkSimple, tooltip: "Snippets" },
      { label: "Style", to: "/style", icon: PaintBrush, tooltip: "Style" },
    ],
  },
  {
    label: "Diagnostics",
    items: [
      { label: "Logs", to: "/logs", icon: Terminal, tooltip: "Event logs" },
    ],
  },
]

const NAV_BUTTON_CLASS = cn(
  "h-9 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground",
  "hover:bg-sidebar-accent/70 hover:text-foreground",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:shadow-none"
)

const NAV_ICON_CLASS =
  "size-[18px] text-muted-foreground transition-colors group-data-[active=true]:text-foreground"

export function SidebarNav() {
  const matchRoute = useMatchRoute()

  return (
    <SidebarContent className="gap-1 px-2">
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.label} className="p-0">
          {group.label ? (
            <SidebarGroupLabel className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = !!matchRoute({
                  to: item.to,
                  fuzzy: false,
                })
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      render={
                        <Link
                          to={item.to}
                          preload="intent"
                          preloadDelay={150}
                        />
                      }
                      isActive={isActive}
                      tooltip={item.tooltip ?? item.label}
                      className={NAV_BUTTON_CLASS}
                    >
                      <Icon weight="regular" className={NAV_ICON_CLASS} />
                      <span className="truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}
