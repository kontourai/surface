export function printHelp(): void {
  console.log(`Kontour Surface

Usage:
  surface report [--input examples/surface-fixtures.json] [--format json|summary|linked|analytics]
  surface report --adapter <name> --input <file> [--format json|summary|linked|analytics]
  surface console [--read-model .surface/runs/latest.json] [--store veritas.claims.json] [--port 4242] [--config surface.config.json]
  surface claim list [--store veritas.claims.json]
  surface claim add --type <claim-type> --surface <surface> --subject-type <type> --subject-id <id> --field <field-or-behavior> [--id <id>] [--impact low|medium|high|critical] [--policy-id <policy-id>] [--metadata '{"key":"value"}'] [--store veritas.claims.json]
  surface claim edit --claim-id <id> [--type <claim-type>] [--surface <surface>] [--subject-type <type>] [--subject-id <id>] [--field <field-or-behavior>] [--impact low|medium|high|critical] [--policy-id <policy-id>] [--metadata '{"key":"value"}'] [--store veritas.claims.json]
  surface claim remove --claim-id <id> [--store veritas.claims.json]
  surface claim validate [--store veritas.claims.json]
  surface get --claim-id <claim-id> [--input path] [--adapter name]
  surface stale [--input path] [--adapter name]
  surface missing [--input path] [--adapter name]
  surface policy [--policy-id <policy-id> | --claim-id <claim-id>] [--input path] [--adapter name]
  surface mcp [--input path] [--adapter name]

Surface reports map product claims to evidence, freshness, and trust status.
surface mcp serves trust state to agents over the Model Context Protocol (stdio).
`);
}
