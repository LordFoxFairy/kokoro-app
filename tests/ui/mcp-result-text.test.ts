import { expect, it } from "vitest"
import { mcpResultText } from "@/ui/thread/mcp-result-text"

it.each([
  ["Plain result\nsecond line", ["Plain result\nsecond line"]],
  ['"Decoded\\nline"', ["Decoded\nline"]],
  ['["first", "second", "first"]', ["first", "second", "first"]],
  [JSON.stringify({ text: ["Available pages\n- Overview"], structured_content: { result: "Available pages\n- Overview" } }), ["Available pages\n- Overview"]],
  [JSON.stringify({ text: ["literal \\n and <img> [link](https://example.test)"] }), ["literal \\n and <img> [link](https://example.test)"]],
])("reads only explicit text in %s without recursively decoding or deduplicating", (raw, expected) => {
  expect(mcpResultText(raw as string)).toEqual(expected)
})

it.each(['{"result":"not an explicit text envelope"}', '{"text":["x",{}]}', '["x",{}]', '{"text":["cut', '"cut', '[]', '{"text":[]}', '""', 'null', 'true', '42', ''])
("leaves unknown, empty, or cut representations to technical details: %s", raw => {
  expect(mcpResultText(raw)).toBeNull()
})
