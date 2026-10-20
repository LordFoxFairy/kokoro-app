import { Spinner } from "@/components/ui/spinner"

export function RuntimeLoading({ label }: { label: string }) {
  return (
    <main
      className="grid min-h-svh place-items-center bg-background text-muted-foreground"
      aria-live="polite"
      aria-label={label}
      data-testid="runtime-loading"
    >
      <div className="flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" />
        <span>{label}</span>
      </div>
    </main>
  )
}
