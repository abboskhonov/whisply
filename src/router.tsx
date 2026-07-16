import { createHashHistory, createRouter } from "@tanstack/react-router"

import { Route as rootRoute } from "@/routes/__root"
import { Route as dictionaryRoute } from "@/routes/dictionary"
import { Route as indexRoute } from "@/routes/index"
import { Route as insightsRoute } from "@/routes/insights"
import { Route as logsRoute } from "@/routes/logs"
import { Route as settingsRoute } from "@/routes/settings"
import { Route as snippetsRoute } from "@/routes/snippets"
import { Route as styleRoute } from "@/routes/style"

// Settings sub-routes
import { Route as settingsIndexRoute } from "@/routes/settings/index"
import { Route as settingsGeneralRoute } from "@/routes/settings/general"
import { Route as settingsDictationRoute } from "@/routes/settings/dictation"
import { Route as settingsModelsRoute } from "@/routes/settings/models"
import { Route as settingsShortcutRoute } from "@/routes/settings/shortcut"
import { Route as settingsTextInsertionRoute } from "@/routes/settings/text-insertion"
import { Route as settingsAppearanceRoute } from "@/routes/settings/appearance"
import { Route as settingsAdvancedRoute } from "@/routes/settings/advanced"
import { Route as settingsPlaygroundRoute } from "@/routes/settings/playground"
import { Route as settingsAboutRoute } from "@/routes/settings/about"

const routeTree = rootRoute.addChildren([
  indexRoute,
  insightsRoute,
  logsRoute,
  dictionaryRoute,
  snippetsRoute,
  styleRoute,
  settingsRoute.addChildren([
    settingsIndexRoute,
    settingsGeneralRoute,
    settingsDictationRoute,
    settingsModelsRoute,
    settingsShortcutRoute,
    settingsTextInsertionRoute,
    settingsAppearanceRoute,
    settingsAdvancedRoute,
    settingsPlaygroundRoute,
    settingsAboutRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
