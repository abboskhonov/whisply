import { createRoute } from "@tanstack/react-router"

import { InsightsPage } from "@/pages/insights-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/insights",
  component: InsightsPage,
})
