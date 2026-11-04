# Contributing

Keep Model Lens a small, display-only observer. Do not add a proxy, probe prompts, telemetry, or model
self-identification questions to infer routing.

## Setup

Use Node.js 22.19 or newer. Clone the repository, then:

```sh
npm ci --ignore-scripts
npm run check
npm test
python3 tests/tty-smoke.py
npm run pack:check
```

The Python smoke test requires a POSIX terminal API (macOS/Linux); Python is not a runtime dependency
of the extension. Release-shell tests use Bash, OpenSSL, and shasum, with a fake npm executable that
cannot publish or access the registry. They are skipped on Windows. CI runs on Linux with Node 22 and 24.

Install the checkout for local testing with `pi install /absolute/path/to/pi-model-lens`, then `/reload`.
Disable other copies first. Never use real credentials or paid inference for automated tests.

## Code Boundaries

- `src/capture.ts`: per-call transport observation; preserve Pi's callbacks, stream, authentication, and usage.
- `src/record.ts`: record validation and identifier comparison. Missing evidence must not become a match.
- `src/renderer.ts`: display-only text and lights. Use Pi's terminal-width and theme helpers.
- `src/index.ts`: lifecycle, persistence, commands, and duplicate-collector protection.

Do not add Pi host packages to runtime `dependencies`; Pi supplies them. They belong in
`peerDependencies`, with pinned development copies for compatibility tests.

The `openusage.model-routing` entry and schema 1 are an existing compatibility contract. Avoid breaking
consumers or old sessions. Never mutate assistant content to add labels; the labels must remain absent
from future model context. Keep conflicting signals rather than selecting a convenient answer.

## Tests to Preserve

- Outgoing payload after other transformers, response IDs, retries, failures, cancellation, and concurrent warming.
- Body-only versus official-header evidence, conflicts, missing fields, and bounded captures.
- Unsafe persisted metadata and terminal-control-character rejection.
- Narrow terminals, light/dark themes, restored history, expansion, and unchanged message content.
- Real Pi SDK context-building and Codex adapter behavior with simulated SSE / loopback WebSocket transport.
- The packed package, not just the source checkout, before a release.

To test an unpacked package with the real terminal fixture:

```sh
PI_MODEL_LENS_TEST_PACKAGE=/path/to/unpacked/package python3 tests/tty-smoke.py
```

Only the test extension path changes; credentials and sessions remain isolated. Do not put synthetic
session fixtures into your production Pi session directory.

## Pull Requests

Explain the user-visible behavior, why it is needed, and the checks you ran. Include a terminal capture
or clearly labelled synthetic example for visual changes. Never include real prompts, keys, account
identifiers, or raw provider dumps in issues, pull requests, screenshots, or test fixtures.

Update documentation when behavior changes. Model-version ordering is a project policy, not a benchmark:
new yellow mappings need an explicit rationale and regression tests. Releases are maintainer actions;
see [Releasing](docs/RELEASING.md).

Contributions are under the [MIT license](LICENSE); preserve existing copyright notices.
