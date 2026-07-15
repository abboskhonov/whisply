import { createRoute } from "@tanstack/react-router"

import { DictationSettingsPage } from "@/pages/settings/dictation-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/dictation",
  component: DictationSettingsPage,
})
