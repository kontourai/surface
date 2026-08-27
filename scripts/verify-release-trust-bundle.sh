#!/usr/bin/env bash
set -euo pipefail

bundle_dir="${1:-/tmp/surface-trust-bundle}"
bundle_path="${bundle_dir}/trust-bundle.json"
sigstore_bundle_path="${bundle_dir}/trust-bundle.sigstore.json"
cosign_bin="${COSIGN_BIN:-cosign}"

if [[ ! -f "$sigstore_bundle_path" ]]; then
  echo "Signing skipped: no Sigstore bundle was produced."
  exit 0
fi

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required to verify a Sigstore bundle}"
: "${GITHUB_REF:?GITHUB_REF is required to verify a Sigstore bundle}"

"$cosign_bin" verify-blob \
  --bundle "$sigstore_bundle_path" \
  --certificate-identity "https://github.com/${GITHUB_REPOSITORY}/.github/workflows/publish-npm.yml@${GITHUB_REF}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  "$bundle_path"
