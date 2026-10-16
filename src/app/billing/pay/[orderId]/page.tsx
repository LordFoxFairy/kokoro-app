import { MockPayPanel } from "@/ui/billing/mock-pay-panel"

// Preserve the published URL without treating its unverified ID as an order.
export default function MockPayRoute() {
  return <MockPayPanel />
}
