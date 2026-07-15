import { createRoute } from "@tanstack/react-router"

import { TextInsertionSettingsPage } from "@/pages/settings/text-insertion-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/text-insertion",
  component: TextInsertionSettingsPage,
})
