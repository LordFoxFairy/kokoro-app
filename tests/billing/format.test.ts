import { describe, expect, it } from "vitest"

import {
  formatCredits,
  formatMicros,
  formatMinor,
  formatSignedCredits,
  formatSignedMicros,
  microSign,
} from "@/billing/format"

describe("credit formatting (1 积分 = 1000000 micros, BigInt safe)", () => {
  it("shifts micros to credits, trims trailing zeros", () => {
    expect(formatCredits("10000")).toBe("0.01") // 0.01 积分
    expect(formatCredits("80000")).toBe("0.08") // 0.08 积分
    expect(formatCredits("1000000")).toBe("1") // 1 积分
    expect(formatCredits("5000")).toBe("0.005") // 微额积分
    expect(formatCredits("0")).toBe("0")
  })
  it("signs credits: + on positive, - on negative, none on zero", () => {
    expect(formatSignedCredits("50000")).toBe("+0.05")
    expect(formatSignedCredits("-250000")).toBe("-0.25")
    expect(formatSignedCredits("0")).toBe("0")
  })
  it("keeps BigInt precision + displays unknown on garbage", () => {
    expect(formatCredits("90071992547409930000")).toBe("90071992547409.93")
    expect(formatCredits("not-a-number")).toBe("—")
  })
})

describe("micro-unit formatting (BigInt safe)", () => {
  it("shifts micros to units and trims trailing zeros", () => {
    expect(formatMicros("1000000")).toBe("1")
    expect(formatMicros("1500000")).toBe("1.5")
    expect(formatMicros("250000")).toBe("0.25")
    expect(formatMicros("1")).toBe("0.000001")
    expect(formatMicros("0")).toBe("0")
  })

  it("preserves precision beyond Number.MAX_SAFE_INTEGER (no float rounding)", () => {
    // 9_007_199_254_740_993 micros = 9_007_199_254.740993 units. Number(...) 会把这串舍成 ...992。
    const micros = "9007199254740993"
    expect(formatMicros(micros)).toBe("9007199254.740993")
    // 反证：过 Number 会丢末位精度。
    expect(String(Number(micros) / 1_000_000)).not.toBe("9007199254.740993")
  })

  it("handles negatives and signs", () => {
    expect(formatMicros("-250000")).toBe("-0.25")
    expect(microSign("-250000")).toBe("negative")
    expect(microSign("250000")).toBe("positive")
    expect(microSign("0")).toBe("zero")
    expect(formatSignedMicros("250000")).toBe("+0.25")
    expect(formatSignedMicros("-250000")).toBe("-0.25")
    expect(formatSignedMicros("0")).toBe("0")
  })

  it("displays unknown on malformed input instead of throwing", () => {
    expect(formatMicros("not-a-number")).toBe("—")
    expect(microSign("1.5")).toBe("zero")
  })
})

describe("minor-unit price formatting (PAY-2, BigInt safe)", () => {
  it("shifts minor units to 2-decimal amount", () => {
    expect(formatMinor("4900")).toBe("49.00")
    expect(formatMinor("9")).toBe("0.09")
    expect(formatMinor("0")).toBe("0.00")
    expect(formatMinor("100000")).toBe("1000.00")
  })

  it("keeps BigInt precision beyond Number range", () => {
    expect(formatMinor("900719925474099300")).toBe("9007199254740993.00")
  })

  it("displays unknown on malformed input instead of throwing", () => {
    expect(formatMinor("not-a-number")).toBe("—")
  })
})

// R52: Billing published experimental v2.0.1 defines 1 credit = 1_000_000 micros.
// These target-unit assertions do not assert BFF wallet wire adoption or live billing readiness.
describe("R52 credit formatting (Billing experimental v2, 10^6 micros per credit)", () => {
  it.each([
    ["1000000", "1"],
    ["1500000", "1.5"],
    ["250000", "0.25"],
    ["-250000", "-0.25"],
    ["0", "0"],
  ])("formats %s micros as %s credits, consistent with formatMicros", (micros, expected) => {
    expect(formatMicros(micros)).toBe(expected)
    expect(formatCredits(micros)).toBe(expected)
    expect(formatCredits(micros)).toBe(formatMicros(micros))
  })

  it.each([
    ["1", "0.000001"],
    ["-1", "-0.000001"],
  ])("preserves one-micro precision for %s micros", (micros, expected) => {
    expect(formatMicros(micros)).toBe(expected)
    expect(formatCredits(micros)).toBe(expected)
    expect(formatCredits(micros)).toBe(formatMicros(micros))
  })

  it.each([
    ["9007199254740993", "9007199254.740993"],
    ["-9007199254740993", "-9007199254.740993"],
  ])("preserves exact credit decimals beyond 2^53 for %s micros", (micros, expected) => {
    expect(formatMicros(micros)).toBe(expected)
    expect(String(Number(micros) / 1_000_000)).not.toBe(expected)
    expect(formatCredits(micros)).toBe(expected)
    expect(formatCredits(micros)).toBe(formatMicros(micros))
  })

  it.each([
    ["1", "+0.000001"],
    ["-1", "-0.000001"],
    ["9007199254740993", "+9007199254.740993"],
    ["-9007199254740993", "-9007199254.740993"],
    ["0", "0"],
  ])("formats signed %s micros as %s credits without precision loss", (micros, expected) => {
    expect(formatSignedMicros(micros)).toBe(expected)
    expect(formatSignedCredits(micros)).toBe(expected)
    expect(formatSignedCredits(micros)).toBe(formatSignedMicros(micros))
  })
})

describe("R54 invalid monetary amounts remain unknown rather than zero", () => {
  const formatters = [
    { name: "formatCredits", format: formatCredits },
    { name: "formatMicros", format: formatMicros },
    { name: "formatSignedCredits", format: formatSignedCredits },
    { name: "formatSignedMicros", format: formatSignedMicros },
    { name: "formatMinor", format: formatMinor },
  ]

  for (const { name, format } of formatters) {
    it.each(["not-a-number", "1.5", "", "   ", "NaN", "Infinity"])(
      `${name} displays invalid amount %j as unknown`,
      (invalid) => {
        expect(format(invalid)).toBe("—")
      },
    )
  }

  it.each([
    ["4900", "49.00"],
    ["-9", "-0.09"],
    ["0", "0.00"],
    ["900719925474099300", "9007199254740993.00"],
  ])("preserves valid cash minor-unit semantics for %s", (minor, expected) => {
    expect(formatMinor(minor)).toBe(expected)
  })
})
