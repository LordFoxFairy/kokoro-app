import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { WebSkinProvider } from "@/components/ui/web-skin"

afterEach(cleanup)

describe("portal web skin", () => {
  it("carries the site token scope into Dialog portals", () => {
    render(
      <WebSkinProvider value="kokoro">
        <Dialog open>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
          </DialogContent>
        </Dialog>
      </WebSkinProvider>,
    )

    expect(screen.getByRole("dialog").closest('[data-web-skin="kokoro"]')).not.toBeNull()
  })

  it("carries the same token scope into Tooltip portals", async () => {
    render(
      <WebSkinProvider value="kokoro">
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger>Help</TooltipTrigger>
            <TooltipContent>Available balance</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </WebSkinProvider>,
    )

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.closest('[data-web-skin="kokoro"]')).not.toBeNull()
  })
})
