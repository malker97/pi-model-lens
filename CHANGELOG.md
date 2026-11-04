# Changelog

## Unreleased

- Capture requested and server-reported model identities for normal Pi OpenAI Codex replies.
- Show right-aligned response-model-only badges with green, yellow, red, or gray status dots.
- Treat `gpt-6-astra` → `gpt-6.2-astra` as an explicit yellow upgrade; all other identifier differences, including cross-family responses, are red.
- Keep requested model and evidence details behind expansion instead of repeating them on each badge.
- Preserve response-body versus official-header evidence and expandable diagnostics.
- Keep OpenUsage's existing custom-entry schema and diagnostic command compatible.
- Add duplicate-collector protection, offline SDK/transport tests, and narrow-terminal/history checks.
- Keep npm publication disabled during local testing.
