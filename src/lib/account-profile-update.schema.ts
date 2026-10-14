import { z } from "zod";
import * as wire from "@/generated/bff-account-profile/zod.gen";

export const accountProfileUpdateSchema = wire.zAccountProfileInput
  .extend({
    name: wire.zAccountProfileInput.shape.name.refine(
      (value) =>
        value.length <= 100 &&
        value.trim() === value &&
        !/[\uD800-\uDFFF]/u.test(value) &&
        !Array.from(value).some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || (code >= 127 && code <= 159);
        }),
    ),
    expected_name: wire.zAccountProfileInput.shape.expected_name.refine(
      (value) => value.length <= 16384,
    ),
  })
  .strict();
export const accountProfileRequestIdSchema = wire.zRequestId;
export const accountProfileUpdateAckSchema = wire.zAccountProfileResponse
  .extend({ data: wire.zAccountProfileResponse.shape.data.strict() })
  .strict();
const errors = {
  400: wire.zAccountProfileError400,
  401: wire.zAccountProfileError401,
  403: wire.zAccountProfileError403,
  409: wire.zAccountProfileError409,
  413: wire.zAccountProfileError413,
  429: wire.zAccountProfileError429,
  500: wire.zAccountProfileError500,
  502: wire.zAccountProfileError502,
  503: wire.zAccountProfileError503,
};
export const accountProfileUpdateErrorSchemas = Object.fromEntries(
  Object.entries(errors).map(([status, schema]) => [
    status,
    schema.extend({ error: schema.shape.error.strict() }).strict(),
  ]),
);
export type AccountProfileUpdate = z.infer<typeof accountProfileUpdateSchema>;

/** This operation's raw JSON grammar preserves escaped original UTF16 units and rejects duplicate keys. */
export function parseAccountProfileJson(text: string): unknown {
  let at = 0;
  const whitespace = () => {
    while (/[\t\n\r ]/u.test(text[at] ?? "x")) at += 1;
  };
  const string = (): string => {
    const start = at++;
    while (at < text.length) {
      const value = text[at++];
      if (value === "\\") {
        at += 1;
        continue;
      }
      if (value === '"') return JSON.parse(text.slice(start, at)) as string;
    }
    throw new Error("Invalid JSON string");
  };
  const value = (depth: number): unknown => {
    if (depth > 32) throw new Error("JSON nesting limit");
    whitespace();
    if (text[at] === '"') return string();
    if (text[at] === "{") {
      at += 1;
      whitespace();
      const object: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      const keys = new Set<string>();
      if (text[at] === "}") {
        at += 1;
        return object;
      }
      for (;;) {
        whitespace();
        if (text[at] !== '"') throw new Error("Invalid object");
        const key = string();
        if (keys.has(key)) throw new Error("Duplicate key");
        keys.add(key);
        whitespace();
        if (text[at++] !== ":") throw new Error("Invalid object");
        object[key] = value(depth + 1);
        whitespace();
        const next = text[at++];
        if (next === "}") return object;
        if (next !== ",") throw new Error("Invalid object");
      }
    }
    if (text[at] === "[") {
      at += 1;
      whitespace();
      const array: unknown[] = [];
      if (text[at] === "]") {
        at += 1;
        return array;
      }
      for (;;) {
        array.push(value(depth + 1));
        whitespace();
        const next = text[at++];
        if (next === "]") return array;
        if (next !== ",") throw new Error("Invalid array");
      }
    }
    const match =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
        text.slice(at),
      );
    if (!match) throw new Error("Invalid JSON value");
    at += match[0].length;
    return JSON.parse(match[0]) as unknown;
  };
  const output = value(0);
  whitespace();
  if (at !== text.length) throw new Error("Trailing JSON data");
  return output;
}
