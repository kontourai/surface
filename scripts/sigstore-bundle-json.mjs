/**
 * Serialise an in-memory Sigstore bundle (as returned by @sigstore/sign) to
 * the protobuf-JSON wire shape that cosign and other verifiers read.
 *
 * There is deliberately no fallback: `JSON.stringify` of the in-memory bundle
 * writes `$case` wrappers and Buffer objects, which cosign cannot read ("bundle
 * does not contain cert for verification"). If @sigstore/bundle cannot be
 * resolved, this throws and the caller treats signing as not done.
 */
import { bundleToJSON } from "@sigstore/bundle";

export function sigstoreBundleJson(bundle) {
  return bundleToJSON(bundle);
}
