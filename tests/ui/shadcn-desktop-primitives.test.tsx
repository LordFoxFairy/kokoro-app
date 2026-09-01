import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

afterEach(cleanup)

describe("shadcn desktop primitive sizing", () => {
  it("does not inject the retired 960px mobile control sizing", () => {
    render(
      <>
        <Button>Action</Button>
        <Tabs defaultValue="one">
          <TabsList><TabsTrigger value="one">One</TabsTrigger></TabsList>
        </Tabs>
        <Select><SelectTrigger aria-label="Choice"><SelectValue placeholder="Choice" /></SelectTrigger></Select>
      </>,
    )

    for (const control of [
      screen.getByRole("button", { name: "Action" }),
      screen.getByRole("tab", { name: "One" }),
      screen.getByRole("combobox", { name: "Choice" }),
    ]) {
      expect(control.className).not.toContain("max-[960px]")
    }
  })

  it("keeps the Dialog close control at the standard shadcn size", () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Close"><DialogTitle>Dialog</DialogTitle></DialogContent>
      </Dialog>,
    )

    const close = screen.getByRole("button", { name: "Close" })
    expect(close).toHaveClass("size-8")
    expect(close.className).not.toContain("max-[960px]")
  })
})
