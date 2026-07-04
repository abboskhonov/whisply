import { createRoute } from "@tanstack/react-router"

import { SnippetsPage } from "@/pages/snippets-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/snippets",
  component: SnippetsPage,
})
