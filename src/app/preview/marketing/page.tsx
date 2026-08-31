import { LandingPage } from "@/ui/marketing/landing-page"
import { DEFAULT_BRAND } from "@/config/brand"

// Explicit local fixture for marketing visual regression. Production marketing
// still enters through the root route and the live runtime manifest.
export default function PreviewMarketingPage() {
  return <LandingPage brandName={DEFAULT_BRAND.name} brandMark={DEFAULT_BRAND.mark} marketingHref="/preview/marketing" />
}
