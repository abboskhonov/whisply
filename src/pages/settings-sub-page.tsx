import { PageShell, PageHeader, Section } from "@/components/page"

type SettingsSubPageProps = {
  title: string
  description: string
}

export function SettingsSubPage({ title, description }: SettingsSubPageProps) {
  return (
    <PageShell>
      <PageHeader title={title} description={description} />
      <Section>
        <p className="text-sm text-muted-foreground">
          Settings content coming soon.
        </p>
      </Section>
    </PageShell>
  )
}
