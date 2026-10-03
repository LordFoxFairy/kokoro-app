import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

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

export function RuntimeSessionUnavailable({ label, retryLabel, pendingLabel, onRetry, compact = false, pending = false }: {
  label: string
  retryLabel: string
  pendingLabel: string
  onRetry: () => void
  compact?: boolean
  pending?: boolean
}) {
  const alert = (
    <Alert variant="destructive" className="max-w-md">
      <AlertDescription className="flex items-center gap-3">
        <span>{label}</span>
        <Button variant="outline" size="sm" onClick={onRetry} disabled={pending} aria-busy={pending}>
          {pending ? <Spinner aria-hidden="true" /> : null}
          {pending ? pendingLabel : retryLabel}
        </Button>
      </AlertDescription>
    </Alert>
  )
  if (compact) return <div className="fixed inset-x-4 top-4 z-50 flex justify-center">{alert}</div>
  return <main className="grid min-h-svh place-items-center bg-background p-4">{alert}</main>
}
