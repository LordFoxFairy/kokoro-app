import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { LocaleProvider, useT } from "@/i18n/context"
import { useAwaitingNotify } from "@/ui/shell/use-awaiting-notify"
import { resetAwaiting } from "@/ui/hitl/awaiting-store"
function Harness({ identity, session, phase }: { identity: string; session: string; phase: string }) {
  const ids = useAwaitingNotify(session, phase, useT(), "IdentityBrand", identity)
  return <output>{[...ids].join(",")}</output>
}
afterEach(() => { cleanup(); resetAwaiting() })
it("preserves same-identity session badges but clears registry/title on identity retirement and unmount", () => {
  const view = render(<Harness identity="a:1" session="first" phase="waiting" />, { wrapper: LocaleProvider })
  view.rerender(<Harness identity="a:1" session="second" phase="idle" />)
  expect(screen.getByRole("status")).toHaveTextContent("first")
  view.rerender(<Harness identity="b:2" session="second" phase="idle" />)
  expect(screen.getByRole("status")).not.toHaveTextContent("first")
  expect(document.title).toBe("IdentityBrand Web")
  view.rerender(<Harness identity="b:2" session="second" phase="waiting" />)
  view.unmount()
  expect(document.title).toBe("IdentityBrand Web")
})

it("keeps another session waiting badge across an admission recheck when resource identity stays the same", () => {
  const view = render(<Harness identity="same-subject" session="first" phase="waiting" />, { wrapper: LocaleProvider })
  view.rerender(<Harness identity="same-subject" session="second" phase="idle" />)
  view.rerender(<Harness identity="same-subject" session="second" phase="idle" />)
  expect(screen.getByRole("status")).toHaveTextContent("first")
})

it("does not immediately re-register a retired subject's unchanged waiting projection", () => {
  const view = render(<Harness identity="subject-a" session="old-private-session" phase="waiting" />, { wrapper: LocaleProvider })
  view.rerender(<Harness identity="subject-b" session="old-private-session" phase="waiting" />)
  expect(screen.getByRole("status")).not.toHaveTextContent("old-private-session")
  view.rerender(<Harness identity="subject-b" session="new-private-session" phase="waiting" />)
  expect(screen.getByRole("status")).toHaveTextContent("new-private-session")
})
