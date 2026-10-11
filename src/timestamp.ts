// Status function version "4" timestamps (Hachure 0.18.0, status-function.md
// "Timestamps"): an RFC 3339 `date-time` with a required offset, read as an
// exact instant and compared without ever holding it in a binary
// floating-point number of milliseconds.
//
// These are ports of the `hachure` package's parseTimestamp and
// compareTimestamps; tests/status-v4-timestamps.test.ts asserts the two agree.
// Versions "2" and "3" keep reading times with `Date.parse`.

/**
 * An exact instant: whole milliseconds since the epoch, and the fractional
 * digits below the millisecond as a string with trailing zeros removed (""
 * when there are none). Compare with {@link compareTimestamps}, never by
 * subtracting.
 */
export interface TimestampInstant {
  epochMilliseconds: number;
  subMillisecond: string;
}

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

/**
 * Read a value as a version "4" timestamp, or `undefined` when it is not one.
 * The offset is required; lower-case `t` / `z` are accepted; the date must
 * exist; second `60` is accepted only at 23:59:60 UTC and read as the instant
 * that follows it. A date without a time, a time without an offset, hour 24,
 * prose, and any non-string are not timestamps.
 */
export function parseTimestamp(value: unknown): TimestampInstant | undefined {
  if (typeof value !== "string") return undefined;
  const m = RFC3339.exec(value);
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const offsetMinutes = m[8] ? (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10])) : 0;
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 60) return undefined;
  if (m[8] && (Number(m[9]) > 23 || Number(m[10]) > 59)) return undefined;
  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (day < 1 || day > daysInMonth) return undefined;

  // setUTCFullYear, not Date.UTC, which maps years 0-99 to 1900-1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  const minuteStart = date.getTime() - offsetMinutes * 60_000;
  if (second === 60) {
    // A leap second exists only as 23:59:60 UTC.
    const utc = new Date(minuteStart);
    if (utc.getUTCHours() !== 23 || utc.getUTCMinutes() !== 59) return undefined;
  }
  // The fraction is split as digits, never converted to a floating-point number.
  const digits = m[7] ? m[7].slice(1) : "";
  return {
    epochMilliseconds: minuteStart + second * 1000 + Number(digits.slice(0, 3).padEnd(3, "0")),
    subMillisecond: digits.slice(3).replace(/0+$/, ""),
  };
}

/** Order two instants exactly: negative when `a` is earlier, positive when later, 0 when equal. */
export function compareTimestamps(a: TimestampInstant, b: TimestampInstant): number {
  if (a.epochMilliseconds !== b.epochMilliseconds) return a.epochMilliseconds < b.epochMilliseconds ? -1 : 1;
  // Trailing zeros are gone, so the digit strings order as the fractions do.
  if (a.subMillisecond === b.subMillisecond) return 0;
  return a.subMillisecond < b.subMillisecond ? -1 : 1;
}

/** A `Date` as an instant (whole milliseconds), or undefined for an invalid date. */
export function instantFromDate(date: Date): TimestampInstant | undefined {
  const ms = date instanceof Date ? date.getTime() : Number.NaN;
  return Number.isFinite(ms) ? { epochMilliseconds: ms, subMillisecond: "" } : undefined;
}

/**
 * A finite non-negative number as an exact decimal: its shortest round-trip
 * decimal form (`String(n)`, which is the canonical form the specification
 * defines), as digits / 10^places. 0.7 is 7 / 10, never the binary64 value
 * 0.6999999999999999555910790149937...
 */
function exactDecimal(n: number): { digits: bigint; places: number } {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(n));
  if (!match) throw new RangeError(`not a finite non-negative number: ${String(n)}`);
  const [, whole, fraction = "", exponent = "0"] = match;
  const places = fraction.length - Number(exponent);
  const digits = BigInt(whole! + fraction);
  return places >= 0 ? { digits, places } : { digits: digits * 10n ** BigInt(-places), places: 0 };
}

/**
 * Version "4" Step 4a: is `now` later than `start` plus `amount` units of
 * `unitMs` milliseconds? Exact: the window is the decimal product and every
 * fractional digit of both instants counts. `amount` must be a finite
 * non-negative number.
 */
export function laterThanWindowEnd(now: TimestampInstant, start: TimestampInstant, amount: number, unitMs: number): boolean {
  const window = exactDecimal(amount);
  const places = Math.max(window.places, now.subMillisecond.length, start.subMillisecond.length);
  const scaled = (instant: TimestampInstant): bigint =>
    BigInt(instant.epochMilliseconds) * 10n ** BigInt(places) + BigInt(instant.subMillisecond.padEnd(places, "0") || "0");
  const windowScaled = window.digits * BigInt(unitMs) * 10n ** BigInt(places - window.places);
  return scaled(now) > scaled(start) + windowScaled;
}
