# Pi Model Lens

**See what you requested—and what the server reported.**

[中文说明](README.zh-CN.md) · [Releases](https://github.com/malker97/pi-model-lens/releases) · [Release Guide](docs/RELEASING.md)

A standalone Pi extension that shows the response model and a small status light above each completed
OpenAI Codex reply. The badge is right-aligned and display-only: it never changes the assistant's answer
or adds tokens to future model context.

```text
                                                        gpt-6-astra ●

The assistant's original answer stays unchanged.
```

No proxy, probe prompts, global fetch patch, or separate desktop app is required.

## Install

Requires **Pi 1.5** and **Node.js 22.19 or later**. Compatibility tests currently use Pi 1.5.0 with
Node 22 and 24, in regular and fullscreen terminal modes.

Install the GitHub release:

```sh
pi install git:github.com/malker97/pi-model-lens@v0.0.1
```

Run `/reload` in existing sessions. New sessions load it automatically. The tag is pinned; install a
newer release intentionally when you want to upgrade.

**npm status:** the package is prepared for npm, but registry publication is a separate, manually
approved operation. Until a version is actually listed on npm, use the GitHub installation above.

After npm publication, the equivalent command will be:

```sh
pi install npm:pi-model-lens@0.0.1
```

### Local Development or Migration

```sh
pi install /absolute/path/to/pi-model-lens
```

A local installation points to that checkout; keep the directory in place. Before switching between
local, Git, and npm installations, use `pi list` and remove the previous source with `pi remove <source>`.
Do not load two copies.

If upgrading from the original `openusage-routing.ts`, move that file out of your agent directory's
`extensions` folder and keep it as a backup elsewhere. Model Lens detects duplicate collectors and
pauses its own capture rather than double-recording responses.

To uninstall, run `pi remove` with the source you installed, then `/reload`. This does not delete or
rewrite existing conversations.

## Read the Light

Only the response identifier and the light appear on the collapsed badge. Colors follow Pi's theme.

| Light | Meaning |
|---|---|
| Green | Reported model identifier matches the outgoing request |
| Yellow | The response is in the project's explicitly configured upgrade pair |
| Red | Any other identifier difference, including cross-family responses |
| Gray | Missing, incomplete, conflicting, or invalid evidence prevents a comparison |

The current project-maintainer policy treats **`gpt-6-astra` → `gpt-6.2-astra`** as the yellow pair.
This is **not an OpenAI rating or a benchmark result**. The reverse direction and other differences,
such as `gpt-6-astra` → `gpt-6.1-sol`, are red. Larger version numbers do not automatically count as upgrades.
Red means “not the requested identifier,” not proof of lower quality.

If no unambiguous response model is available, the label is `Unknown`. Model identifiers are compared
verbatim; the extension does not invent alias equivalences or verify model weights.

Use Pi's expansion shortcut (default **Ctrl+O**) for the request identifier, full evidence, response ID,
and completion time:

- **Response Model Field Only:** the response body supplied `response.model`.
- **Server Model Metadata:** an `openai-model` / `x-openai-model` header was present without conflicting identifiers.
- **Conflicting Model Fields:** reported identifiers disagree; all evidence is preserved.

The detailed comparison still says the identifiers differ for a yellow upgrade pair.

`/model-lens` shows the latest record without making a request. `/openusage-routing` is a migration alias.

## Coverage and Limitations

- Captures Pi's **`openai-codex` provider using `openai-codex-responses`**, through WebSocket and SSE hooks.
- Shows badges after successful completion, including tool-calling replies. Tool results are not separate model replies.
- Excludes failed, cancelled, truncated, internal, and cache-warming calls from successful-reply badges.
- Restores badges for historical replies that already contain captured evidence. It cannot recover data that was never recorded.
- Additional account provider IDs, direct Codex CLI calls, OpenAI API-key providers, Claude, and DeepSeek are not currently captured.
- Future Pi versions need compatibility testing; a badge's identity is whatever the server reports, not independent proof of the model behind it.

## Privacy and Compatibility

Model Lens delegates to Pi's existing provider, preserving authentication, callbacks, transport, message
content, and usage. Separate per-call state and response-ID matching keep retries and concurrent cache
warming from being assigned to the wrong assistant reply.

It stores only request/response model identifiers, evidence sources, response ID, completion time, and
status as local **custom session entries**. It does not add prompts, answers, reasoning, tool arguments,
cookies, other headers, or credentials to those entries, and does not upload them. Sharing or exporting
a Pi session may include its custom metadata.

For migration compatibility, the entry type remains `openusage.model-routing` with schema version 1.
External tools can optionally read that format. **Model Lens does not depend on OpenUsage** or any other
consumer. See [Data Format](docs/DATA_FORMAT.md) for the schema and [Security](SECURITY.md) for the trust boundaries.

## Troubleshooting

- **No badge:** run `/reload`; check that you are using the supported provider and that the response completed. Old replies without metadata cannot be backfilled.
- **Duplicate-collector warning:** remove the old standalone extension or duplicate package source, then reload.
- **Gray light:** expand the record or run `/model-lens`; missing or conflicting data is not guessed from the selected model.
- **Only response-body evidence:** headers are not always supplied. The extension does not promote a body field into an official header signal.
- **Narrow terminal:** the model name is shortened, but the dot remains. Expansion shows the full identifier.

## Development and Releases

```sh
npm ci --ignore-scripts
npm run check
npm test
python3 tests/tty-smoke.py
npm run pack:check
```

There are no runtime npm dependencies; Pi supplies the host packages. Development tests use a real Pi
SDK, mocked SSE, and a loopback-only WebSocket server. Terminal smoke tests use isolated synthetic
sessions, not real credentials or model requests.

See [Contributing](CONTRIBUTING.md) for the test matrix and [Releasing](docs/RELEASING.md) for GitHub
release artifacts, checksums, manual npm gates, and Trusted Publishing setup. Ordinary pushes and pull
requests never publish npm packages.

## License

[MIT](LICENSE): commercial use, modification, redistribution, and use in closed-source projects are
permitted when the copyright and permission notices are retained. No warranty is provided.

The initial capture implementation was developed in the [OpenUsage fork](https://github.com/malker97/openusage).
The MIT notice from [upstream OpenUsage](https://github.com/robinebers/openusage) is retained alongside
the notice for this project's contributions.
