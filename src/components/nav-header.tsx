import { Link } from "@tanstack/react-router"
import { Waveform } from "@phosphor-icons/react"

export function AppBrand() {
  return (
    <div className="flex w-full items-center px-2.5 py-1.5">
      <Link
        to="/"
        className="group/brand flex min-w-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm"
        >
          <Waveform weight="fill" className="size-4" />
        </div>
        <span className="ml-2 truncate text-[15px] font-semibold tracking-tight transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:opacity-0">
          Whisply
        </span>
      </Link>
    </div>
  )
}
