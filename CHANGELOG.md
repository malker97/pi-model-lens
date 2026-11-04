# Changelog

## [0.0.1] - 2026-11-04

First open-source release of Pi Model Lens, a standalone Pi extension for requested versus
server-reported model identities.

### Features

- Capture normal OpenAI Codex Responses traffic through Pi's WebSocket and SSE hooks, without probe prompts or a proxy.
- Display a right-aligned response model and status dot: matching identifiers are green, the project's explicit Astra upgrade pair is yellow, other differences are red, and inconclusive evidence is gray.
- Expand full request/model evidence with Ctrl+O, or inspect the latest record with `/model-lens`.
- Keep labels outside assistant content and future model context; restore saved badges when sessions resume.
- Preserve the existing schema 1 custom records and `/openusage-routing` migration alias for optional external consumers.
- Reject duplicate collectors, unsafe persisted metadata, and unsupported release metadata.

### Verification and Distribution

- Type checks and unit/integration tests run on Node 22 and 24.
- Real Pi SDK, simulated SSE, loopback WebSocket, and regular/fullscreen terminal checks require no real model credentials.
- GitHub releases include a tested package tarball and SHA-256 checksum.
- Npm publication is separate, manual, and disabled until the owner enables it and configures Trusted Publishing.

### Scope

Pi 1.5.0 and the `openai-codex` / `openai-codex-responses` path are the tested scope. Model identifiers
are server reports, not independent model-weight verification; the yellow mapping is project policy,
not an OpenAI rating.

### Install from GitHub

```sh
pi install git:github.com/malker97/pi-model-lens@v0.0.1
```

Run `/reload` in an existing session. Remove the old standalone collector or duplicate installation
source before enabling this package.
