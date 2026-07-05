import { createRoute } from "@tanstack/react-router"

import { LogsPage } from "@/pages/logs-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/logs",
  component: LogsPage,
})
