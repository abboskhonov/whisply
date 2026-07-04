import {
  createHashHistory,
  createRouter,
} from "@tanstack/react-router"

import { Route as rootRoute } from "@/routes/__root"
import { Route as dictionaryRoute } from "@/routes/dictionary"
import { Route as indexRoute } from "@/routes/index"
import { Route as insightsRoute } from "@/routes/insights"
import { Route as settingsRoute } from "@/routes/settings"
import { Route as snippetsRoute } from "@/routes/snippets"
import { Route as styleRoute } from "@/routes/style"

const routeTree = rootRoute.addChildren([
  indexRoute,
  insightsRoute,
  dictionaryRoute,
  snippetsRoute,
  styleRoute,
  settingsRoute,
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
