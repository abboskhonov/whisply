import * as React from "react"
import { ArrowLeft, DownloadSimple, GearSix } from "@phosphor-icons/react"

import {
  getAvailableUpdate,
  installAvailableUpdate,
  subscribeToAvailableUpdate,
} from "@/lib/app-updater"
import { cn } from "@/lib/utils"
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const NAV_ICON_CLASS =
  "size-[18px] text-muted-foreground transition-colors group-data-[active=true]:text-foreground"

const NAV_BUTTON_CLASS = cn(
  "h-9 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground",
  "hover:bg-sidebar-accent/70 hover:text-foreground",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:shadow-none"
)

type SidebarFooterNavProps = {
  isOpen: boolean
  onToggle: () => void
}

export function SidebarFooterNav({ isOpen, onToggle }: SidebarFooterNavProps) {
  const { open, setOpen } = useSidebar()
  const [availableUpdate, setAvailableUpdate] =
    React.useState(getAvailableUpdate)
  const [installingUpdate, setInstallingUpdate] = React.useState(false)

  React.useEffect(
    () =>
      subscribeToAvailableUpdate(() => {
        setAvailableUpdate(getAvailableUpdate())
      }),
    []
  )

  const handleClick = () => {
    if (!isOpen && !open) setOpen(true)
    onToggle()
  }

  const handleUpdate = async () => {
    setInstallingUpdate(true)
    await installAvailableUpdate()
    setInstallingUpdate(false)
  }

  return (
    <SidebarFooter className="p-2">
      <SidebarMenu className="gap-0.5">
        {availableUpdate ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`Update to version ${availableUpdate.update.version}`}
              disabled={installingUpdate}
              onClick={() => void handleUpdate()}
              className={NAV_BUTTON_CLASS}
            >
              <DownloadSimple
                weight="regular"
                className={NAV_ICON_CLASS}
                aria-hidden
              />
              <span className="truncate">
                {installingUpdate ? "Updating…" : "Update available"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
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
