import { createRoute } from "@tanstack/react-router"

import { StylePage } from "@/pages/style-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/style",
  component: StylePage,
})
