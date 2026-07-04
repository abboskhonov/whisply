import { createRoute } from "@tanstack/react-router"

import { DictionaryPage } from "@/pages/dictionary-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dictionary",
  component: DictionaryPage,
})
