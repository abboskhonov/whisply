import { createRoute } from "@tanstack/react-router"

import { SettingsSubPage } from "@/pages/settings-sub-page"
import { Route as settingsRoute } from "@/routes/settings"

export const Route = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/text-insertion",
  component: () => (
    <SettingsSubPage
      title="Text insertion"
      description="How transcribed text is pasted in."
    />
  ),
})
