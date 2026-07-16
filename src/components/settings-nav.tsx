import {
  Cpu,
  Cursor,
  GearSix,
  Info,
  Keyboard,
  Flask,
  Microphone,
  Palette,
  Sliders,
} from "@phosphor-icons/react"
import { Link, useMatchRoute } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type IconLike = React.ComponentType<{
  className?: string
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
}>

type SettingsNavItem = {
  id: string
  label: string
  to: string
  icon: IconLike
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "general", label: "General", to: "/settings/general", icon: GearSix },
  {
    id: "dictation",
    label: "Dictation",
    to: "/settings/dictation",
    icon: Microphone,
  },
  { id: "models", label: "Models", to: "/settings/models", icon: Cpu },
  {
    id: "shortcut",
    label: "Shortcut",
    to: "/settings/shortcut",
    icon: Keyboard,
  },
  {
    id: "text-insertion",
    label: "Text insertion",
    to: "/settings/text-insertion",
    icon: Cursor,
  },
  {
    id: "appearance",
    label: "Appearance",
    to: "/settings/appearance",
    icon: Palette,
  },
  {
    id: "advanced",
    label: "Advanced",
    to: "/settings/advanced",
    icon: Sliders,
  },
  {
    id: "playground",
    label: "Playground",
    to: "/settings/playground",
    icon: Flask,
  },
  { id: "about", label: "About", to: "/settings/about", icon: Info },
]

const NAV_BUTTON_CLASS = cn(
  "h-9 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground",
  "hover:bg-sidebar-accent/70 hover:text-foreground",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:shadow-none"
)

const NAV_ICON_CLASS =
  "size-[18px] text-muted-foreground transition-colors group-data-[active=true]:text-foreground"

export function SettingsSidebarPanel() {
  const matchRoute = useMatchRoute()

  return (
    <SidebarContent className="gap-1 px-2">
      <SidebarMenu className="gap-0.5">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = !!matchRoute({
            to: item.to,
            fuzzy: false,
          })
          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                render={
                  <Link to={item.to} preload="intent" preloadDelay={150} />
                }
                isActive={isActive}
                tooltip={item.label}
                className={NAV_BUTTON_CLASS}
              >
                <Icon weight="regular" className={NAV_ICON_CLASS} />
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarContent>
  )
}
