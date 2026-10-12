"use client"

import { useState, type SVGProps } from "react"
import { FolderPlus, Gift, Globe2, Plus, Server, Wifi } from "lucide-react"

import { useT } from "@/i18n/context"
import { mutationHeaders } from "@/lib/client/mutation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"

import styles from "./settings-sections.module.css"

const computerPlans = [
  { id: "basic", name: "Basic", price: 10, summaryKey: "settings.computerPlanBasic", hintKey: "settings.computerPlanBasicHint", performance: "0.5×", cpu: "2", memory: "1 GB", traffic: "200 GB", storage: "35 GB", recommended: false },
  { id: "standard", name: "Standard", price: 30, summaryKey: "settings.computerPlanStandard", hintKey: "settings.computerPlanStandardHint", performance: "1×", cpu: "2", memory: "4 GB", traffic: "500 GB", storage: "70 GB", recommended: true },
  { id: "advanced", name: "Advanced", price: 50, summaryKey: "settings.computerPlanAdvanced", hintKey: "settings.computerPlanAdvancedHint", performance: "4×", cpu: "2", memory: "8 GB", traffic: "1000 GB", storage: "120 GB", recommended: false },
] as const

const storagePresets = [35, 70, 120, 250, 500, 750, 1000] as const

function CloudComputerGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="4.5" width="25" height="18" rx="2.5" fill="#454545" />
      <rect x="6" y="7" width="20" height="13" rx="1" fill="#666" />
      <path d="M12 27.5h8M16 22.5v5" stroke="#454545" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function MyComputerCard({ brandName, preview = false }: { brandName?: string; preview?: boolean }) {
  const t = useT()
  const brand = brandName ?? "Kokoro"
  const [computerMode, setComputerMode] = useState<"cloud" | "local">("cloud")
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<(typeof computerPlans)[number]["id"]>("standard")
  const [storageGb, setStorageGb] = useState(70)
  const [creating, setCreating] = useState(false)
  const plan = computerPlans.find((entry) => entry.id === selectedPlan) ?? computerPlans[1]
  const includedStorageGb = Number.parseInt(plan.storage, 10)
  const extraStorageGb = Math.max(0, storageGb - includedStorageGb)
  const storageMonthlyPrice = extraStorageGb * 0.1
  const monthlyTotal = plan.price + storageMonthlyPrice
  const formatPrice = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1)

  const createComputer = async (): Promise<void> => {
    setCreating(true)
    try {
      if (!preview) {
        const response = await fetch("/api/hub/cloud-computers", {
          method: "POST",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ plan: plan.id, name: `${brandName ?? "Kokoro"} Computer`, region: "us-east", storage_gb: storageGb }),
        })
        if (!response.ok) throw new Error(`cloud_computer_create_failed:${response.status}`)
      }
      setConfirmOpen(false)
      setCreateOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={styles.computerSettings} data-testid="settings-computer">
      <div className={styles.computerTabs} role="tablist" aria-label={t("settings.computerTitle")}>
        <Button type="button" variant="ghost" role="tab" aria-selected={computerMode === "cloud"} data-active={computerMode === "cloud"} onClick={() => setComputerMode("cloud")}>{t("settings.cloudComputer")}</Button>
        <Button type="button" variant="ghost" role="tab" aria-selected={computerMode === "local"} data-active={computerMode === "local"} onClick={() => setComputerMode("local")}>{t("settings.localComputer")}</Button>
      </div>
      {computerMode === "cloud" ? (
        <section className={styles.computerEmptyCard}>
          <span className={styles.computerVisual}><CloudComputerGlyph /></span>
          <div><strong>{t("settings.computerAlwaysAvailable")}</strong><p>{t("settings.computerAlwaysAvailableHint")}</p></div>
          <Button type="button" onClick={() => setCreateOpen(true)}><Plus />{t("settings.createNow")}</Button>
        </section>
      ) : (
        <section className={styles.localComputerEmpty} data-testid="settings-local-computer">
          <FolderPlus aria-hidden="true" />
          <strong>{t("settings.folderAccessRequired")}</strong>
          <p>{t("settings.folderAccessPrefix")}<a href="kokoro://app">{t("settings.desktopApp", { brand })}</a>{t("settings.folderAccessSuffix", { brand })}</p>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={styles.computerCreateDialog} closeLabel={t("shell.closeDialog")} data-testid="computer-create-dialog">
          <DialogTitle className={styles.computerCreateTitle}>{t("settings.createCloudComputer")}</DialogTitle>
          <div className={styles.computerCreateBody}>
              <div className={styles.computerUpgradeBanner}><Gift aria-hidden="true" /><span>{t("settings.computerUpgradeHint")}</span><Button type="button" size="sm">{t("firstSite.upgrade")}</Button></div>
              <div className={styles.computerPlans}>
                {computerPlans.map((entry) => (
                  <button key={entry.id} type="button" className={styles.computerPlan} data-selected={entry.id === selectedPlan} onClick={() => { setSelectedPlan(entry.id); setStorageGb(Number.parseInt(entry.storage, 10)) }}>
                    <header><strong>{entry.name}</strong>{entry.recommended ? <span>{t("settings.recommended")}</span> : null}</header>
                    <div className={styles.computerPrice}><strong>${entry.price}</strong><span>{t("settings.perMonth")}</span></div>
                    <h4>{t(entry.summaryKey)}</h4>
                    <p>{t(entry.hintKey)}</p>
                    <dl><div><dt>{t("settings.compute")}</dt><dd>{entry.performance}</dd></div><div><dt>{t("settings.virtualCpu")}</dt><dd>{entry.cpu}</dd></div><div><dt>{t("settings.memory")}</dt><dd>{entry.memory}</dd></div><div><dt>{t("settings.outboundTraffic")}</dt><dd>{entry.traffic}</dd></div><div><dt>{t("settings.storage")}</dt><dd>{entry.storage}</dd></div></dl>
                  </button>
                ))}
              </div>
              <div className={styles.computerIncluded}><span>{t("settings.everyPlanIncludes")}</span><div><span><Server />Ubuntu Server 24.04 LTS 64-bit</span><span><Globe2 />{t("settings.publicIp")}</span><span><Wifi />1000 Mbps {t("settings.inboundBandwidth")}</span></div></div>
              <div className={styles.computerConfiguration}>
                <div className={styles.computerLocation}><span>{t("settings.location")}</span><strong>{t("settings.usEast")}</strong></div>
                <div className={styles.computerStorageHead}>
                  <span>{t("settings.storage")}</span>
                  <div className={styles.computerStorageValue}>
                    <Input
                      type="number"
                      min={35}
                      max={1000}
                      value={storageGb}
                      aria-label={t("settings.storageSizeGb")}
                      onChange={(event) => setStorageGb(Math.min(1000, Math.max(35, Number(event.target.value) || 35)))}
                    />
                    <span>GB</span><span>=</span><strong>${formatPrice(storageMonthlyPrice)}</strong><span>{t("settings.perMonth")}</span>
                  </div>
                </div>
                <Slider
                  className={styles.computerStorageSlider}
                  min={35}
                  max={1000}
                  step={1}
                  value={[storageGb]}
                  aria-label={t("settings.storageSizeGb")}
                  onValueChange={(value) => setStorageGb(value[0] ?? includedStorageGb)}
                />
                <div className={styles.computerStoragePresets}>
                  {storagePresets.map((value) => (
                    <Button key={value} type="button" variant="ghost" size="sm" data-active={storageGb === value || undefined} onClick={() => setStorageGb(value)}>{value} GB</Button>
                  ))}
                </div>
              </div>
            </div>
          <DialogFooter className={styles.computerCreateFooter}>
            <div><strong>{t("settings.monthlyTotal")}</strong><span>${formatPrice(monthlyTotal)} {t("settings.perMonth")}</span><small>{t("settings.overageHint")}</small></div>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button type="button" onClick={() => setConfirmOpen(true)}>{t("settings.nextStep")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className={styles.computerOrderDialog} closeLabel={t("shell.closeDialog")}>
          <DialogTitle>{t("settings.confirmOrder")}</DialogTitle>
          <p className={styles.computerOrderDescription}>{t("settings.reviewComputerOrder")}</p>
          <div className={styles.computerOrderLines}>
            <div><strong>{plan.name}</strong><span>${plan.price} {t("settings.perMonth")}</span></div>
            <div><span>{t("settings.includedOutboundTraffic", { amount: plan.traffic })}</span><em>{t("settings.free")}</em></div>
            {extraStorageGb > 0 ? <div><span>{t("settings.extraStorage", { amount: extraStorageGb })}</span><span>${formatPrice(storageMonthlyPrice)} {t("settings.perMonth")}</span></div> : null}
          </div>
          <div className={styles.computerOrderTotal}><strong>{t("settings.estimatedMonthlyCost")}</strong><div><span>${formatPrice(monthlyTotal)} {t("settings.perMonthFull")}</span><small>{t("settings.taxNotIncluded")}</small></div></div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={creating} onClick={() => void createComputer()}>{t("settings.pay")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
