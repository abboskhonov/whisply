import { createRoute } from "@tanstack/react-router"

import { SettingsSubPage } from "@/pages/settings-sub-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/dictation",
  component: () => (
    <SettingsSubPage
      title="Dictation"
      description="Recording, language, and voice."
    />
  ),
})
