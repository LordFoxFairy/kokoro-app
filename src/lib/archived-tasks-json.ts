/** Archived tasks and archive state raw JSON: preserve historical escaped UTF16, reject duplicate decoded keys and trailing/nested data. */
export function parseArchivedTasksJson(text: string): unknown {
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
