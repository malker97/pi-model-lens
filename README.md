# Pi Model Lens

**See what you requested—and what the server reported.**

A Pi extension that places a right-aligned model-identity badge above each completed OpenAI Codex
assistant reply. It observes normal requests; it does not send probe prompts, replace the terminal UI,
or add labels to model context.

```text
                         Req: gpt-6-astra → Resp: gpt-6-astra [Match · Body]

The assistant's original answer stays unchanged.
```

## Preview Status

This is a private, local-test package. It is **not published to npm**, and `private: true` prevents an
accidental npm publish. Requires **Pi 1.5** and **Node.js 22.19 or later**; the current host compatibility
tests are pinned to Pi 1.5.0.

## Install Locally

```sh
pi install /absolute/path/to/pi-model-lens
```

Run `/reload` in existing Pi sessions. New sessions load it automatically. Local installs reference the
checkout, so keep the directory in place. Nothing needs rebuilding in OpenUsage.

**Migrating from `openusage-routing.ts`:** first move the old file out of `~/.pi/agent/extensions/` (or your
custom agent directory's extension folder). Keep it as a backup elsewhere. Do not load both collectors.
Model Lens pauses its own capture and warns if a duplicate collector is detected.

To remove the package:

```sh
pi remove /absolute/path/to/pi-model-lens
```

Reload afterwards. Existing session records are retained; conversations are not rewritten.

## Read the Badge

| Label | Meaning |
|---|---|
| Match | The reported model identifier equals the model in the outgoing request |
| Different | The reported identifier differs; this may be an alias or version change, not necessarily a downgrade |
| Unknown | Request or response model metadata is missing |
| Conflict | Model identifiers disagree across response fields or events |
| Incomplete | Metadata was bounded or could not be safely correlated; no match verdict is claimed |
| Body | Evidence came only from `response.model` |
| Server | An `openai-model` / `x-openai-model` header was present, without conflicting evidence |

Identifiers are compared verbatim; no model-version aliases are invented. A match is a comparison of
server-reported identifiers, **not verification of model weights**.

The badge appears after a reply completes, including replies that call tools. Local tool-result blocks
do not get separate model identities. Failed, cancelled, truncated, internal, and cache-warming calls do
not get successful-reply badges. Earlier replies with saved routing records render on session resume;
missing historical evidence cannot be recovered.

Narrow terminals shorten both identifiers while keeping the comparison visible. Pi's tool-output
expansion shortcut (default **Ctrl+O**) reveals the full evidence, response ID, and completion time.

`/model-lens` shows the latest record without making a request. `/openusage-routing` remains an alias.

## Privacy and OpenUsage Compatibility

The extension delegates to the existing `openai-codex` provider's `streamSimple` implementation. It
preserves authentication, callbacks, transport, assistant content, and usage. WebSocket and SSE model
events are captured per call, and the final response ID is matched to the actual assistant message.
No global `fetch` patch, proxy certificate, or model self-identification prompt is used.

Records contain only request/response model identifiers, evidence-source labels, response ID, completion
time, and status. They are stored as Pi custom entries, **not as assistant text**. No prompt, answer,
reasoning, tool arguments, cookies, other headers, or credentials are added to these records. This
package does not upload them. Sharing/exporting a Pi session may include its custom metadata entries.

The entry name **`openusage.model-routing`** and schema version **1** are unchanged, so OpenUsage's
Usage Trend continues reading the same data. Model Lens does not depend on the OpenUsage app.

Currently only Pi's **`openai-codex` / `openai-codex-responses`** path is captured. Additional account
provider IDs, direct Codex CLI calls, OpenAI API-key providers, Claude, and DeepSeek are outside this
first version. Reload is required after package updates.

## Development and Tests

```sh
npm ci --ignore-scripts
npm run check
npm test
python3 tests/tty-smoke.py  # macOS/Linux: isolated regular + fullscreen TUI preview
npm run pack:check
```

There are no runtime npm dependencies: Pi supplies the host packages. Development dependencies are
used for type-checking and tests only.

Tests cover request transformations, both model signal types, conflicts, unknowns, retries, concurrency,
warmups, cancellation, privacy, duplicate collectors, narrow rendering, theme changes, and history
restoration. A real Pi SDK test verifies that labels never enter the next model context. Real Codex
adapter tests use mocked SSE and a loopback-only WebSocket server, not a real account. The POSIX TUI
smoke test opens isolated synthetic sessions in regular and fullscreen modes, expands the evidence,
and exits without submitting prompts or changing production session content.

The exact badge placement is tested against Pi 1.5's native custom-entry insertion behavior. Future Pi
versions should pass those compatibility tests before being declared supported.

## License and Attribution

MIT. The capture logic originated in [OpenUsage](https://github.com/malker97/openusage), also MIT;
the original copyright notice is retained in `LICENSE`.
