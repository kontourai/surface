import type { Adapter } from "../adapter.js";
import type { TrustBundle } from "../types.js";

/**
 * A generic envelope-unwrap adapter (issue #84).
 *
 * Some producers ship a Trust Bundle wrapped inside a larger record envelope
 * (e.g. a Veritas evidence record carries the bundle at `trust.bundle`). Feeding
 * that envelope to the identity `surface` adapter fails with "Missing required
 * schemaVersion". Rather than teach Surface a producer-specific format — which
 * would cut against the principle that producers own their adapters — this
 * factory builds a neutral adapter that unwraps a configurable dot-path to the
 * inner bundle. A named producer (like `veritas`) is then just a thin preset of
 * this primitive, and Surface stays producer-neutral.
 *
 * The adapter is tolerant of a bundle that is already unwrapped: if the envelope
 * path is absent but the record itself looks like a Trust Bundle
 * (`schemaVersion` present), it is passed through, so a consumer can feed either
 * the wrapped or the bare shape.
 */
export function createEnvelopeAdapter(config: {
  /** Registered adapter name (e.g. "veritas"). */
  name: string;
  /** Dot-path to the inner Trust Bundle within the envelope (e.g. "trust.bundle"). */
  unwrapPath: string;
  defaultExample?: string;
}): Adapter {
  const segments = config.unwrapPath.split(".").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`Envelope adapter "${config.name}" requires a non-empty unwrapPath`);
  }

  const adapter: Adapter = {
    name: config.name,
    adapt(record: unknown): TrustBundle {
      const unwrapped = resolvePath(record, segments);
      if (isRecord(unwrapped)) {
        return unwrapped as unknown as TrustBundle;
      }
      // Tolerate an already-unwrapped bundle so either shape can be fed. Require
      // a stronger bundle-shape signal than a lone `schemaVersion` (a `claims`
      // array): otherwise an envelope that carries its own top-level
      // `schemaVersion` but whose unwrap path is broken would silently pass
      // through as its own bundle instead of surfacing the actionable error.
      if (isRecord(record) && "schemaVersion" in record && Array.isArray(record.claims)) {
        return record as unknown as TrustBundle;
      }
      throw new Error(
        `${config.name} adapter: expected an envelope carrying a Trust Bundle at "${config.unwrapPath}", or a bare Trust Bundle.`,
      );
    },
  };
  if (config.defaultExample !== undefined) {
    adapter.defaultExample = config.defaultExample;
  }
  return adapter;
}

function resolvePath(record: unknown, segments: string[]): unknown {
  let current: unknown = record;
  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
