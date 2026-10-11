/**
 * Status function versions this package can evaluate. Version "4" (Hachure
 * 0.18: RFC 3339 timestamps compared exactly, unevaluable times fail closed)
 * is the default, as it is Hachure's. Versions "3" and "2" stay selectable so a
 * record resolved under them (`InquiryRecord.statusFunctionVersion`, a stored
 * report or checkpoint) can be re-derived with the algorithm that produced it.
 */
export const supportedStatusFunctionVersions = ["2", "3", "4"] as const;

export type StatusFunctionVersion = (typeof supportedStatusFunctionVersions)[number];

/**
 * The version of the status derivation algorithm implemented by default.
 * Increment when the algorithm changes so that stored InquiryRecords can be
 * re-evaluated if needed.
 */
export const statusFunctionVersion: StatusFunctionVersion = "4";

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
