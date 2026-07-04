import { createRoute } from "@tanstack/react-router"

import { HomePage } from "@/pages/home-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
})
