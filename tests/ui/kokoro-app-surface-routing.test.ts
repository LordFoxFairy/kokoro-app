import { describe, expect, it } from "vitest"

import { kokoroAppRoute } from "@/features/app/kokoro-app-surface"

describe("Kokoro App surface routing", () => {
  it.each([
    ["/app", { surface: "chat" }],
    ["/app/", { surface: "chat" }],
    ["/app/agents", { surface: "agents" }],
    ["/app/agents/", { surface: "agents" }],
    ["/app/plugins", { surface: "plugins" }],
    ["/app/scheduled", { surface: "scheduled" }],
    ["/app/library", { surface: "library" }],
    ["/app/skills", { surface: "skills" }],
  ] as const)("selects the stable surface for %s", (pathname, expected) => {
    expect(kokoroAppRoute(pathname)).toEqual(expected)
  })

  it("keeps the opaque project reference path-only and leaves query state to the surface", () => {
    expect(kokoroAppRoute("/app/project/kokoro")).toEqual({ surface: "project", projectRef: "kokoro" })
    expect(kokoroAppRoute("/app/project/project_a/")).toEqual({
      surface: "project",
      projectRef: "project_a",
    })
  })

  it("decodes an encoded project reference exactly once before client encoding", () => {
    expect(kokoroAppRoute("/app/project/project%20a")).toEqual({
      surface: "project",
      projectRef: "project a",
    })
    expect(kokoroAppRoute("/app/project/project%2Fa")).toEqual({
      surface: "project",
      projectRef: "project/a",
    })
    expect(kokoroAppRoute("/app/project/%E0%A4%A")).toEqual({ surface: "chat" })
  })

  it("falls back to direct chat for unknown app paths instead of mounting a second shell", () => {
    expect(kokoroAppRoute("/app/unknown/catalog")).toEqual({ surface: "chat" })
    expect(kokoroAppRoute("/login")).toEqual({ surface: "chat" })
  })
})
