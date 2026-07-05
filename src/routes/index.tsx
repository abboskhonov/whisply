import { createRoute, redirect } from "@tanstack/react-router"

import { HomePage } from "@/pages/home-page"
import { Route as rootRoute } from "@/routes/__root"

const ONBOARDING_KEY = "whisply-onboarding-complete"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const completed = localStorage.getItem(ONBOARDING_KEY)
      if (completed !== "true") {
        throw redirect({ to: "/onboarding" })
      }
    }
  },
  component: HomePage,
})
