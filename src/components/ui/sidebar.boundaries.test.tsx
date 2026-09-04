import { render, screen } from "@testing-library/react"
import { it, expect } from "vitest"

import { Sidebar } from "./sidebar-shell"
import { SidebarProvider } from "./sidebar-state"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./sidebar-menu"

it("keeps the sidebar state, shell, and menu item boundaries composable", () => {
  render(
    <SidebarProvider defaultOpen={false}>
      <Sidebar>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive aria-label="导航入口">
              导航
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </Sidebar>
    </SidebarProvider>,
  )

  const menuButton = screen.getByRole("button", { name: "导航入口" })

  expect(menuButton).toHaveAttribute("data-slot", "sidebar-menu-button")
  expect(menuButton).toHaveAttribute("data-active", "true")
  expect(menuButton.closest('[data-slot="sidebar"]')).toBeInTheDocument()
})
