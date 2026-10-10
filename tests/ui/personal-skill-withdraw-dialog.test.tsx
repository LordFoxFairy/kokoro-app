import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { PersonalSkillWithdrawDialog } from "@/ui/skills/personal-skill-withdraw-dialog"
const skill = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "Mine", summary: "", tags: [], status: "active" as const, skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { source_kind: "personal" as const, publication_audience: "owner" as const, state_version: "4" } }
afterEach(cleanup)
it("freezes the exact withdrawal reason CAS and key after unknown acknowledgement", async () => {
 window.localStorage.setItem("kokoro.locale", "zh")
 const withdraw = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValueOnce({})
 const confirmed = vi.fn()
 render(<LocaleProvider><PersonalSkillWithdrawDialog skill={skill} client={{withdraw}} open admitted onOpenChange={vi.fn()} onConfirmed={confirmed}/></LocaleProvider>)
 fireEvent.change(screen.getByLabelText("撤回原因"), {target:{value:"由本人撤回"}})
 fireEvent.click(screen.getByRole("button", {name:"确认撤回"}))
 await screen.findByRole("alert")
 expect(confirmed).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole("button", {name:"重试"}))
 await waitFor(()=>expect(confirmed).toHaveBeenCalledTimes(1))
 expect(withdraw.mock.calls[0]?.slice(0,3)).toEqual(withdraw.mock.calls[1]?.slice(0,3))
 expect(withdraw.mock.calls[0]?.[1]).toEqual({reason:"由本人撤回",expected_state_version:"4"})
})
it("retires an unconfirmed request on admission loss and permits only original-intent retry", async () => {
 window.localStorage.setItem("kokoro.locale", "zh")
 const withdraw = vi.fn().mockImplementation(()=>new Promise(()=>undefined))
 const confirmed=vi.fn(); const props={skill,client:{withdraw},open:true,onOpenChange:vi.fn(),onConfirmed:confirmed}
 const view=render(<LocaleProvider><PersonalSkillWithdrawDialog {...props} admitted/></LocaleProvider>)
 fireEvent.change(screen.getByLabelText("撤回原因"),{target:{value:"由本人撤回"}})
 fireEvent.click(screen.getByRole("button",{name:"确认撤回"}))
 view.rerender(<LocaleProvider><PersonalSkillWithdrawDialog {...props} admitted={false}/></LocaleProvider>)
 expect(withdraw.mock.calls[0]?.[3].aborted).toBe(true)
 view.rerender(<LocaleProvider><PersonalSkillWithdrawDialog {...props} admitted/></LocaleProvider>)
 fireEvent.click(screen.getByRole("button",{name:"重试"}))
 expect(withdraw).toHaveBeenCalledTimes(2)
 expect(withdraw.mock.calls[0]?.slice(0,3)).toEqual(withdraw.mock.calls[1]?.slice(0,3))
 expect(confirmed).not.toHaveBeenCalled()
})
