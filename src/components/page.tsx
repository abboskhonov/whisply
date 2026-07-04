import * as React from "react"

import { cn } from "@/lib/utils"

type PageShellProps = React.ComponentProps<"div">

export function PageShell({ className, ...props }: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 md:px-10 md:py-10",
        className
      )}
      {...props}
    />
  )
}

type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  meta?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

type SectionProps = React.ComponentProps<"section">

export function Section({ className, ...props }: SectionProps) {
  return <section className={cn("flex flex-col gap-3", className)} {...props} />
}

type SectionHeaderProps = {
  title: string
  description?: string
  trailing?: React.ReactNode
  className?: string
}

export function SectionHeader({
  title,
  description,
  trailing,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3 px-1",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {trailing ? (
        <div className="shrink-0 text-xs text-muted-foreground">{trailing}</div>
      ) : null}
    </div>
  )
}

type ListProps = React.ComponentProps<"ul">

export function List({ className, ...props }: ListProps) {
  return (
    <ul
      className={cn(
        "divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40",
        className
      )}
      {...props}
    />
  )
}

type ListItemProps = React.ComponentProps<"li">

export function ListItem({ className, ...props }: ListItemProps) {
  return <li className={cn("group/item", className)} {...props} />
}

type ListRowProps = React.ComponentProps<"div">

export function ListRow({ className, ...props }: ListRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 transition-colors",
        "group-hover/item:bg-muted/40",
        className
      )}
      {...props}
    />
  )
}

type ListLeadingProps = {
  icon: React.ReactNode
  tone?: "default" | "accent" | "muted"
  className?: string
}

export function ListLeading({ icon, tone = "muted", className }: ListLeadingProps) {
  return (
    <div
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md",
        tone === "default" &&
          "bg-foreground/5 text-foreground",
        tone === "accent" &&
          "bg-primary/10 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
        className
      )}
    >
      {icon}
    </div>
  )
}

type ListContentProps = React.ComponentProps<"div">

export function ListContent({ className, ...props }: ListContentProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  )
}

type ListTitleProps = React.ComponentProps<"p">

export function ListTitle({ className, ...props }: ListTitleProps) {
  return (
    <p
      className={cn(
        "truncate text-[13.5px] font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

type ListSubtitleProps = React.ComponentProps<"p">

export function ListSubtitle({ className, ...props }: ListSubtitleProps) {
  return (
    <p
      className={cn("truncate text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

type ListTrailingProps = React.ComponentProps<"div">

export function ListTrailing({ className, ...props }: ListTrailingProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-card/30 px-6 py-10 text-center">
      {icon ? (
        <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
