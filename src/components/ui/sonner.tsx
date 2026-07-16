import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/components/theme-provider"

function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme()

  return <Sonner theme={theme} {...props} />
}

export { Toaster }
