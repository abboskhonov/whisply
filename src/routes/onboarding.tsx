import { createRoute } from "@tanstack/react-router"

import { OnboardingPage } from "@/pages/onboarding-page"
import { Route as rootRoute } from "@/routes/__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
})
