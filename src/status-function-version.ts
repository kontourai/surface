/**
 * Status function versions this package can evaluate. Version "3" is the
 * default; version "2" stays selectable so a record resolved under it
 * (`InquiryRecord.statusFunctionVersion`, a stored report or checkpoint) can be
 * re-derived with the algorithm that produced it.
 */
export const supportedStatusFunctionVersions = ["2", "3"] as const;

export type StatusFunctionVersion = (typeof supportedStatusFunctionVersions)[number];

/**
 * The version of the status derivation algorithm implemented by default.
 * Increment when the algorithm changes so that stored InquiryRecords can be
 * re-evaluated if needed.
 */
export const statusFunctionVersion: StatusFunctionVersion = "3";

export function isSupportedStatusFunctionVersion(value: unknown): value is StatusFunctionVersion {
  return (supportedStatusFunctionVersions as readonly unknown[]).includes(value);
}

/** The requested version, or the default when none is requested. An unsupported version is refused. */
export function resolveStatusFunctionVersion(requested?: string): StatusFunctionVersion {
  if (requested === undefined) return statusFunctionVersion;
  if (!isSupportedStatusFunctionVersion(requested)) {
    throw new RangeError(
      `unsupported statusFunctionVersion ${JSON.stringify(requested)}; supported: ${supportedStatusFunctionVersions.join(", ")}`,
    );
  }
  return requested;
}
