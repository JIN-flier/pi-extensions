export interface ReportOptions {
  from: Date;
  to: Date;
  allBranches: boolean;
  output?: string;
}

function splitArgs(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let started = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && i + 1 < input.length)
        token += input[++i];
      else token += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) tokens.push(token);
      token = "";
      started = false;
    } else {
      token += char;
      started = true;
    }
  }
  if (quote) throw new Error("参数中的引号未闭合");
  if (started) tokens.push(token);
  return tokens;
}

function localDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`无效日期：${value}；请使用 YYYY-MM-DD`);
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)
  ) {
    throw new Error(`无效日期：${value}`);
  }
  return date;
}

function boundary(value: string, isEnd: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = localDate(value);
    if (isEnd) date.setDate(date.getDate() + 1);
    return date;
  }
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (!match) throw new Error(`无效时间：${value}；请使用 ISO 8601 格式`);
  const [, day, hour, minute, second = "0", millis = "0", zone] = match;
  const base = localDate(day);
  const h = Number(hour),
    min = Number(minute),
    sec = Number(second),
    ms = Number(millis.padEnd(3, "0"));
  if (h > 23 || min > 59 || sec > 59) throw new Error(`无效时间：${value}`);
  if (!zone)
    return new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      h,
      min,
      sec,
      ms,
    );
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`无效时间：${value}`);
  return parsed;
}

export function parseOptions(input: string, now = new Date()): ReportOptions {
  const values = new Map<string, string>();
  let allBranches = false;
  const tokens = splitArgs(input);
  for (let i = 0; i < tokens.length; i++) {
    const [name, inline] = tokens[i].split(/=(.*)/s, 2);
    if (name === "--all-branches") {
      if (inline !== undefined) throw new Error("--all-branches 不接受值");
      allBranches = true;
      continue;
    }
    const key = name === "-o" ? "--output" : name;
    if (!["--date", "--from", "--to", "--output"].includes(key))
      throw new Error(`未知参数：${name}`);
    if (values.has(key)) throw new Error(`重复参数：${key}`);
    const value = inline ?? tokens[++i];
    if (!value || value.startsWith("--")) throw new Error(`${key} 需要一个值`);
    values.set(key, value);
  }
  if (values.has("--date") && (values.has("--from") || values.has("--to"))) {
    throw new Error("--date 不能与 --from 或 --to 同时使用");
  }
  let from: Date;
  let to: Date;
  if (values.has("--date")) {
    from = localDate(values.get("--date")!);
    to = new Date(from);
    to.setDate(to.getDate() + 1);
  } else {
    from = values.has("--from")
      ? boundary(values.get("--from")!, false)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = values.has("--to")
      ? boundary(values.get("--to")!, true)
      : new Date(now);
  }
  if (from.getTime() >= to.getTime())
    throw new Error("结束时间必须晚于开始时间");
  return { from, to, allBranches, output: values.get("--output") };
}
