import { createRoute, Outlet } from "@tanstack/react-router"

import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <Outlet />,
})
