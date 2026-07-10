# Agents and MCP

`surface mcp` serves portable trust state to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io). It is the same trust state a human reads — derived by the kernel, never summarized by a model — exposed as tools an agent can call before acting on a claim.

The server is dependency-free and speaks MCP over stdio, so any MCP-capable client (Claude Code, IDE agents, custom runtimes) can connect without adding network services or credentials.

## Start the server

```bash
surface mcp --input path/to/trust-bundle.json
surface mcp --input path/to/export.json --adapter my-producer
```

`--input` defaults to `examples/surface-example-bundle.json` and `--adapter` to the native `surface` passthrough, matching `surface report`.

A typical MCP client configuration:

```json
{
  "mcpServers": {
    "surface": {
      "command": "npx",
      "args": ["surface", "mcp", "--input", ".surface/trust-bundle.json"]
    }
  }
}
```

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `surface_summary` | `input?`, `adapter?` | The human-readable report summary: claim counts by status, producer surfaces, high-impact unsupported claims, stale and disputed claims, transparency gap counts |
| `surface_stale_claims` | `input?`, `adapter?` | Claims whose verification is no longer current under their freshness policy |
| `surface_missing_evidence` | `input?`, `adapter?` | Policy-required evidence that has not been supplied |
| `surface_get_claim` | `claimId`, `input?`, `adapter?` | One claim with evidence, events, policy, authority trace, transparency gaps, and derivation drilldown |
| `surface_waiver_validity` | `claimId?`, `input?`, `adapter?` | Per-claim [accepted-gap waiver validity](waiver-validity.md) verdicts (not-applicable, bare-assumed, complete-waiver, incomplete-waiver, stale-or-revoked-waiver, command-backed-waiver-rejection); with `claimId`, just that claim's verdict, otherwise every claim in the report |
| `surface_policy` | `policyId?`, `claimId?`, `input?`, `adapter?` | Policy drilldown, or all policies with claim ids and gap counts when called without arguments |

`input` and `adapter` default to the values the server was started with. Every call re-derives the report from the input file, so agents always read current trust state — the same `TrustBundle` produces the same answer on every call, on every machine.

## A realistic session

An agent asked to "use the latest verified pricing data" should not have to guess what "verified" means. With the server pointed at the producer's export, the agent calls `surface_stale_claims` before relying on anything. Against the repo's own example input, the actual tool result is:

```json
[
  {
    "claimId": "claim.field-attested-records.registration-status",
    "surface": "field-attested-records.public-data",
    "status": "stale",
    "impactLevel": "high",
    "claimType": "public-data-field",
    "subject": {
      "subjectType": "attested-record",
      "subjectId": "field-attested-records:denver-example-record"
    },
    "policyId": "policy.public-data-field.short-lived"
  }
]
```

The registration status was verified once, but its 14-day freshness window expired — so instead of acting on it, the agent follows up with `surface_get_claim` for the evidence trace, asks the producer to reverify, or surfaces the uncertainty to the user. No prompt engineering decides this; the policy already did.

## Interactive trust panel (MCP UI)

`surface_summary` and `surface_get_claim` results also carry an embedded [MCP UI](https://mcpui.dev) resource — a `ui://surface/trust-panel/…` entry with MIME type `text/html;profile=mcp-app`. Hosts that render MCP UI show the report as an interactive `<surface-trust-panel>` directly in the conversation; hosts that don't simply ignore the entry and read the text content, which always comes first and is complete on its own.

The embedded document is fully self-contained: the trust panel module and the report data are inlined, no network requests are made, and theming follows the host's light/dark preference through the standard `--k-*` token contract. Pass `--no-ui` to `surface mcp` to omit UI resources entirely.

### Two ways hosts find the panel

The panel is offered under both UI conventions, so one server renders across hosts:

- **Embedded (mcp-ui.dev):** the `ui://` resource is included directly in the `surface_summary` / `surface_get_claim` tool result, as above.
- **Declared (MCP Apps / SEP-1865):** `surface_summary` advertises `_meta["ui/resourceUri"]` (and the nested `_meta.ui.resourceUri`) pointing at `ui://surface/trust-panel/summary`, the server advertises the `resources` capability and the `io.modelcontextprotocol/ui` extension, and the panel is served via `resources/read`. This is the path the official MCP Apps hosts (e.g. ChatGPT, Claude) use to render the panel from a declared resource. `--no-ui` suppresses this surface too (no `resources` capability, no tool `_meta`).

## Behavior contract

- Tool results carry the same JSON shapes as the corresponding CLI commands (`surface report --format summary`, `surface stale`, `surface missing`, `surface get`, `surface policy`).
- Domain failures (unknown claim id, unreadable input) return tool results with `isError: true` rather than protocol errors, so agents can read the message and recover.
- Unknown tools and unknown methods return standard JSON-RPC errors.
- The server advertises the `tools` capability and (unless `--no-ui`) the `resources` capability plus the `io.modelcontextprotocol/ui` extension for the declared trust panel. It exposes no write operations: an agent can inspect trust state through MCP, but changing claims or evidence goes through the producer or the [claim authoring](claim-authoring.md) commands.

## The discipline the kernel hands the agent

The server's instructions to clients state the intended use: act on `verified` claims, reverify `stale` ones, escalate `disputed` ones, and treat transparency gaps as a reason to ask before acting. The agent's job is to read; the kernel's job is to derive the same verdict, deterministically, from the same inputs. See [Use Cases](../product/use-cases.md) for how this plays out per domain.
