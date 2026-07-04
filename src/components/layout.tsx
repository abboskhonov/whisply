import * as React from "react"
import {
  ArrowLeft,
  BookmarkSimple,
  ChartLineUp,
  GearSix,
  House,
  Microphone,
  PaintBrush,
  BookOpen,
  SignOut,
  User,
  Waveform,
} from "@phosphor-icons/react"
import {
  Link,
  useLocation,
  useMatchRoute,
} from "@tanstack/react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type IconLike = React.ComponentType<{ className?: string; weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone" }>

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
]

type SettingsRow = {
  id: string
  label: string
  icon: IconLike
  onClick?: () => void
}

type SettingsGroup = {
  label: string
  items: SettingsRow[]
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Preferences",
    items: [
      { id: "audio", label: "Audio & recording", icon: Microphone },
    ],
  },
  {
    label: "App",
    items: [
      { id: "general", label: "General", icon: GearSix },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "account", label: "Account", icon: User },
      { id: "signout", label: "Sign out", icon: SignOut },
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

function AppBrand() {
  return (
    <div className="flex w-full items-center gap-2 px-1.5 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <Link
        to="/"
        className="group/brand flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm"
        >
          <Waveform weight="fill" className="size-4" />
        </div>
        <span className="truncate text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          Whisply
        </span>
      </Link>
    </div>
  )
}

function SidebarNav() {
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

function SettingsSidebarPanel() {
  return (
    <SidebarContent className="gap-1 px-2">
      <h2 className="px-1 pt-1 pb-2 text-[13px] font-semibold tracking-tight text-foreground">
        Settings
      </h2>
      {SETTINGS_GROUPS.map((group) => (
        <SidebarGroup key={group.label} className="p-0">
          <SidebarGroupLabel className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      onClick={item.onClick}
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

function SidebarFooterNav({
  isOpen,
  onToggle,
}: {
  isOpen: boolean
  onToggle: () => void
}) {
  const { open, setOpen } = useSidebar()
  const handleClick = () => {
    if (!isOpen && !open) setOpen(true)
    onToggle()
  }
  return (
    <SidebarFooter className="p-2">
      <SidebarMenu className="gap-0.5">
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={isOpen ? "Back to app" : "Settings"}
            onClick={handleClick}
            className={NAV_BUTTON_CLASS}
          >
            {isOpen ? (
              <ArrowLeft weight="regular" className={NAV_ICON_CLASS} />
            ) : (
              <GearSix weight="regular" className={NAV_ICON_CLASS} />
            )}
            <span className="truncate">
              {isOpen ? "Back to app" : "Settings"}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}

function AppSidebar() {
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const toggle = React.useCallback(() => setSettingsOpen((o) => !o), [])

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-2 pb-1">
        <AppBrand />
      </SidebarHeader>
      {settingsOpen ? <SettingsSidebarPanel /> : <SidebarNav />}
      <SidebarFooterNav isOpen={settingsOpen} onToggle={toggle} />
      <SidebarRail />
    </Sidebar>
  )
}

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/insights": "Insights",
  "/dictionary": "Dictionary",
  "/snippets": "Snippets",
  "/style": "Style",
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

function AppShellHeader({
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
      <SidebarTrigger className="-ml-1 size-7 text-muted-foreground hover:text-foreground" />
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

export function Layout({ children, header, ...providerProps }: LayoutProps) {
  return (
    <SidebarProvider
      defaultOpen={true}
      {...providerProps}
    >
      <AppSidebar />
      <SidebarInset>
        <AppShellHeader {...(header ?? {})} />
        <div
          data-ui-scroll-container
          className="flex flex-1 flex-col bg-background"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export { AppSidebar, AppShellHeader, AppBrand }
