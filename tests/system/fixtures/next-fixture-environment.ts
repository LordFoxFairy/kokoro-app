import { cp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"

import { tokenizeArgs } from "next/dist/server/lib/utils"

/** Only copied Next child processes receive the version-check deadline. */
export async function nextFixtureEnvironment(root: string, env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const preloader = join(root, "next-version-check.cjs")
  await cp(join(process.cwd(), "tests/system/fixtures/next-version-check.cjs"), preloader)
  // Next dev's native parse/format boundary collapses repeated --require flags.
  // Extract only that repeatable option with Node's parser; preserve every other
  // argument and load the ordered requires through one sandbox-local bootstrap.
  const args = tokenizeArgs(env.NODE_OPTIONS ?? "")
  const { values, tokens } = parseArgs({ args, strict: false, allowPositionals: true, tokens: true,
    options: { require: { type: "string", short: "r", multiple: true } } })
  const consumed = new Set<number>()
  for (const token of tokens) {
    if (token.kind !== "option" || token.name !== "require") continue
    consumed.add(token.index)
    if (!token.inlineValue) consumed.add(token.index + 1)
  }
  const bootstrap = join(root, "next-fixture-preload.cjs")
  await writeFile(bootstrap, [...(values.require ?? []), preloader]
    .map((name) => `require(${JSON.stringify(name)})`).join("\n") + "\n", { mode: 0o600 })
  return {
    ...env,
    KOKORO_TEST_NEXT_VERSION_CHECK_DEADLINE: "1",
    NODE_OPTIONS: [...args.filter((_, index) => !consumed.has(index)).map((arg) => JSON.stringify(arg)),
      `--require=${JSON.stringify(bootstrap)}`].join(" "),
  }
}
