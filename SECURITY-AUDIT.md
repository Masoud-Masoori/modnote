# ModNote — Security Audit

> Run on 2026-05-20 per the operator's NPM safety policy
> (`D:/Claude-Coworker/OPERATOR-PROFILE.md` → "Permanent Policies").

## Direct dependencies (we control these)

All pinned to exact versions — no `^` / `~` / `latest`:

| Package | Pinned | Reason |
|---|---|---|
| `@devvit/public-api` | `0.12.24` | Latest Devvit SDK |
| `@devvit/tsconfig` | `0.12.24` | Match SDK version |
| `@types/node` | `22.10.5` | Node 22 LTS that Devvit runs on |
| `typescript` | `5.6.3` | TS 5.x final; TS 6.0 still in 30-day soak |

`npm audit` against these direct deps alone: **0 high, 0 critical**.

## Transitive findings (Reddit's SDK)

`npm audit` reports **5 high + 1 critical** vulnerabilities chain-rooted at
`protobufjs`, surfacing through `@devvit/protos` → `@devvit/metrics` /
`@devvit/shared` → `@devvit/public-api`. Tested across `@devvit/public-api@0.12.20`
and `@devvit/public-api@0.12.24` — **both have the same chain**.

```
protobufjs <= 7.5.7
├── @devvit/protos
│   ├── @devvit/metrics
│   ├── @devvit/shared
│   └── @devvit/shared-types
└── (no fix available — needs Reddit to ship)
```

CVE list (all upstream `protobufjs`):

- GHSA-xq3m-2v4x-88gg — Arbitrary code execution
- GHSA-66ff-xgx4-vchm — Code injection via bytes field defaults
- GHSA-2pr8-phx7-x9h3 — Denial of service from crafted field names
- GHSA-fx83-v9x8-x52w — Prototype injection in generated message constructors
- GHSA-75px-5xx7-5xc7 — Code generation gadget after prototype pollution
- GHSA-jvwf-75h9-cwgg — Process-wide DoS via unsafe option paths
- GHSA-685m-2w69-288q — DoS via unbounded protobuf recursion
- GHSA-q6x5-8v7m-xcrf — Overlong UTF-8 decoding
- GHSA-jggg-4jg4-v7c6 — DoS via unbounded recursive JSON descriptor expansion

## Risk assessment

| Factor | Assessment |
|---|---|
| Attack surface in ModNote | None — Devvit handles all protobuf wire-format internally; we never parse untrusted protobuf in our application code |
| Exploitable through ModNote's HTTP whitelist (`api.anthropic.com`)? | No — that's an Anthropic JSON API, not protobuf |
| Exploitable through Reddit -> Devvit message bus? | Theoretical, but the threat actor would be Reddit itself; not in our threat model |
| Our mitigation | None possible without Reddit shipping a clean SDK; we cannot bypass Reddit's wire format |

**Accepted residual risk:** Every Devvit app in the Reddit Mod Tools hackathon
inherits this exact dependency chain. The vulnerability is in Reddit's SDK,
not in ModNote's authored code. Operator agrees to ship and document the
chain rather than skip the hackathon.

## Filing the upstream issue

After hackathon submission, we will:

1. File the issue with Reddit at `r/Devvit` Discord
2. Open a GitHub issue on the `reddit/devvit` repo referencing the 9 GHSAs
3. Track Reddit's SDK release for a clean protobufjs (likely `protobufjs@^7.6.0` once published)
4. Re-pin and re-audit when Reddit ships

## Re-audit triggers

Run `npm audit --omit=dev` again whenever:

- We bump any direct dependency
- Reddit ships a new `@devvit/public-api` minor/major
- A new GHSA is published against any of our direct or transitive deps
- ≥ 30 days have passed since the last audit

If a new direct-dependency vulnerability appears at high/critical, ship a
fix before any further Devpost edit.
