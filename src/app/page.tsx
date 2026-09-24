import { DEFAULT_BRAND } from "@/config/brand"
import { LandingPage } from "@/ui/marketing/landing-page"

export default function Home() {
  return <LandingPage brandName={DEFAULT_BRAND.name} brandMark={DEFAULT_BRAND.mark} />
}
