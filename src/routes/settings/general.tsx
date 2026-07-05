import { createRoute } from "@tanstack/react-router"

import { GeneralSettingsPage } from "@/pages/settings/general-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/general",
  component: GeneralSettingsPage,
})
