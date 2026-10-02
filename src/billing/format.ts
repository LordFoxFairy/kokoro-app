// 计费金额格式化：金额恒为「微单位」整数字符串（1 单位 = 1_000_000 微单位）。全程 BigInt——
// 绝不过 Number（余额可能远超 2^53，浮点会丢精度）。展示换算只做十进制移位，不引入货币符号
// （币种/符号由未来 PAY 档决定，这里只给稳定的十进制数字串）。

// tsconfig target 早于 ES2020，不能用 n 字面量；用 BigInt() 构造。
const ZERO = BigInt(0)
const MICROS_PER_UNIT = BigInt(1_000_000)
const FRACTION_DIGITS = 6

export type MicroSign = "positive" | "negative" | "zero"

// BigInt 会接受空白、空串和非十进制表示；金额展示只接受十进制整数串。
function parseAmount(amount: string): bigint | null {
  if (!/^-?\d+$/.test(amount)) return null
  try {
    return BigInt(amount)
  } catch {
    return null
  }
}

// 微单位字符串 → 展示用十进制串（BigInt 安全）。去尾零，负号前置，至少保留整数位。
// 非法输入显示未知 "—"，不把脏数据变成零余额。
export function formatMicros(micros: string): string {
  const value = parseAmount(micros)
  if (value === null) return "—"
  const negative = value < ZERO
  const abs = negative ? -value : value
  const whole = abs / MICROS_PER_UNIT
  const fraction = abs % MICROS_PER_UNIT
  let out = whole.toString()
  if (fraction > ZERO) {
    const frac = fraction.toString().padStart(FRACTION_DIGITS, "0").replace(/0+$/, "")
    out = `${out}.${frac}`
  }
  return negative ? `-${out}` : out
}

// Billing 已发布 experimental v2 单位：1 credit = 1_000_000 micros。
// 积分与微单位展示共用同一 BigInt 十进制算法，不表示钱包 wire 已切换。
export function formatCredits(micros: string): string {
  return formatMicros(micros)
}

// 微单位 → 积分数值（Number）。**仅供图表几何**（sparkline 相对定位）——绝不用于精算/展示金额
// （金额走 BigInt 的 formatCredits）。数值可能舍入，仅计算相对位置；非法输入回退 0。
export function creditsToNumber(micros: string): number {
  const value = parseAmount(micros)
  return value === null ? 0 : Number(value) / Number(MICROS_PER_UNIT)
}

// 带符号积分展示（流水条目）：正数前置「+」，负数自带「-」，零不加号。
export function formatSignedCredits(micros: string): string {
  const formatted = formatCredits(micros)
  if (formatted === "—") return formatted
  return microSign(micros) === "positive" ? `+${formatted}` : formatted
}

// 金额正负（着色/加号用）：BigInt 判定，零单列。
export function microSign(micros: string): MicroSign {
  const value = parseAmount(micros)
  if (value === null) return "zero"
  if (value > ZERO) return "positive"
  if (value < ZERO) return "negative"
  return "zero"
}

// 带符号展示（流水条目）：正数前置「+」，负数由 formatMicros 自带「-」，零不加号。
export function formatSignedMicros(micros: string): string {
  const formatted = formatMicros(micros)
  if (formatted === "—") return formatted
  return microSign(micros) === "positive" ? `+${formatted}` : formatted
}

// 套餐定价（PAY-2）：金额恒为「最小货币单位」整数字符串（1 单位 = 100 分位，如 cents）。全程 BigInt——
// 十进制移位保留两位小数（V1 通用档，零小数币种如 JPY 的精修归后续）；非法输入显示 "—"。
const MINOR_PER_UNIT = BigInt(100)

export function formatMinor(minor: string): string {
  const value = parseAmount(minor)
  if (value === null) return "—"
  const negative = value < ZERO
  const abs = negative ? -value : value
  const whole = abs / MINOR_PER_UNIT
  const fraction = abs % MINOR_PER_UNIT
  const frac = fraction.toString().padStart(2, "0")
  const out = `${whole.toString()}.${frac}`
  return negative ? `-${out}` : out
}
