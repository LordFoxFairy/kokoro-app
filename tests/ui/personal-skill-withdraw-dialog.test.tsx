import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { PersonalSkillWithdrawDialog } from "@/ui/skills/personal-skill-withdraw-dialog"
import { HubClientError } from "@/hub/client"
const skill = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "Mine", summary: "", tags: [], status: "active" as const, skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { source_kind: "personal" as const, publication_audience: "owner" as const, state_version: "4" } }
afterEach(cleanup)
it("freezes the exact withdrawal reason CAS and key after unknown acknowledgement", async () => {
 window.localStorage.setItem("kokoro.locale", "zh")
 const withdraw = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValueOnce({})
 const confirmed = vi.fn()
 render(<LocaleProvider><PersonalSkillWithdrawDialog skill={skill} client={{withdraw}} open admitted onOpenChange={vi.fn()} onConfirmed={confirmed}/></LocaleProvider>)
 expect(screen.getByText("Mine · 版本 1")).toBeInTheDocument()
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

it.each([401, 403, 412])("retains the original unknown withdrawal when its retry is rejected with %s", async (status) => {
 window.localStorage.setItem("kokoro.locale", "zh")
 const withdraw = vi.fn().mockRejectedValueOnce(new Error("lost ACK"))
  .mockRejectedValueOnce(new HubClientError("http", "Retry rejected", "skill_precondition_failed", status))
  .mockResolvedValueOnce({})
 const onOpenChange = vi.fn(); const confirmed = vi.fn()
 const props = { skill, client: { withdraw }, admitted: true, onOpenChange, onConfirmed: confirmed }
 const view = render(<LocaleProvider><PersonalSkillWithdrawDialog {...props} open /></LocaleProvider>)
 fireEvent.change(screen.getByLabelText("撤回原因"), { target: { value: "Original reason" } })
 fireEvent.click(screen.getByRole("button", { name: "确认撤回" }))
 fireEvent.click(await screen.findByRole("button", { name: "重试" }))
 await screen.findByRole("alert")
 fireEvent.click(screen.getByRole("button", { name: "取消" }))
 expect(onOpenChange).toHaveBeenLastCalledWith(false, true)
 view.rerender(<LocaleProvider><PersonalSkillWithdrawDialog {...props} open={false} /></LocaleProvider>)
 view.rerender(<LocaleProvider><PersonalSkillWithdrawDialog {...props} open /></LocaleProvider>)
 fireEvent.click(screen.getByRole("button", { name: "重试" }))
 await waitFor(() => expect(confirmed).toHaveBeenCalledOnce())
 expect(withdraw.mock.calls.map(call => call.slice(0, 3))).toEqual(Array(3).fill(withdraw.mock.calls[0]?.slice(0, 3)))
})

it("releases a first definitive rejection without inventing an unknown outcome", async () => {
 window.localStorage.setItem("kokoro.locale", "zh")
 const withdraw = vi.fn().mockRejectedValue(new HubClientError("http", "Rejected", "skill_precondition_failed", 412))
 const onOpenChange = vi.fn()
 render(<LocaleProvider><PersonalSkillWithdrawDialog skill={skill} client={{ withdraw }} open admitted onOpenChange={onOpenChange} onConfirmed={vi.fn()} /></LocaleProvider>)
 fireEvent.change(screen.getByLabelText("撤回原因"), { target: { value: "Original reason" } })
 fireEvent.click(screen.getByRole("button", { name: "确认撤回" }))
 await screen.findByRole("alert")
 fireEvent.click(screen.getByRole("button", { name: "取消" }))
 expect(onOpenChange).toHaveBeenLastCalledWith(false, false)
})
