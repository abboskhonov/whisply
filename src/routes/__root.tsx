import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router"

import { Layout } from "@/components/app-shell"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const location = useLocation()
  const isOnboarding = location.pathname === "/onboarding"

  if (isOnboarding) {
    return <Outlet />
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
