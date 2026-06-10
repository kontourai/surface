# Agents and MCP

`surface mcp` serves portable trust state to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io). It is the same trust state a human reads — derived by the kernel, never summarized by a model — exposed as tools an agent can call before acting on a claim.

The server is dependency-free and speaks MCP over stdio, so any MCP-capable client (Claude Code, IDE agents, custom runtimes) can connect without adding network services or credentials.

## Start the server

```bash
surface mcp --input path/to/trust-input.json
surface mcp --input path/to/export.json --adapter my-producer
```

`--input` defaults to `examples/surface-fixtures.json` and `--adapter` to the native `surface` passthrough, matching `surface report`.

A typical MCP client configuration:

```json
{
  "mcpServers": {
    "surface": {
      "command": "npx",
      "args": ["surface", "mcp", "--input", ".surface/trust-input.json"]
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
| `surface_policy` | `policyId?`, `claimId?`, `input?`, `adapter?` | Policy drilldown, or all policies with claim ids and gap counts when called without arguments |

`input` and `adapter` default to the values the server was started with. Every call re-derives the report from the input file, so agents always read current trust state — the same `TrustInput` produces the same answer on every call, on every machine.

## A realistic session

An agent asked to "use the latest verified pricing data" should not have to guess what "verified" means. With the server pointed at the producer's export, the agent calls `surface_stale_claims` before relying on anything. Against the repo's own fixture input, the actual tool result is:

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

## Behavior contract

- Tool results carry the same JSON shapes as the corresponding CLI commands (`surface report --format summary`, `surface stale`, `surface missing`, `surface get`, `surface policy`).
- Domain failures (unknown claim id, unreadable input) return tool results with `isError: true` rather than protocol errors, so agents can read the message and recover.
- Unknown tools and unknown methods return standard JSON-RPC errors.
- The server advertises only the `tools` capability. It exposes no write operations: an agent can inspect trust state through MCP, but changing claims or evidence goes through the producer or the [claim authoring](claim-authoring.md) commands.

## The discipline the kernel hands the agent

The server's instructions to clients state the intended use: act on `verified` claims, reverify `stale` ones, escalate `disputed` ones, and treat transparency gaps as a reason to ask before acting. The agent's job is to read; the kernel's job is to be right by construction. See [Use Cases](../product/use-cases.md) for how this plays out per domain.
