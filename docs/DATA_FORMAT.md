# Routing Record Format

Model Lens is standalone. Other tools may optionally read the local records; no consumer is required
for capture, comparison, or Pi's inline display.

## Storage

Pi stores each record in its session JSONL as a `custom` entry. The custom type remains
`openusage.model-routing` for migration compatibility. It is not an assistant message and is excluded
from model context. The plugin does not maintain a separate daemon, server, or database.

Synthetic example:

```json
{
  "type": "custom",
  "customType": "openusage.model-routing",
  "data": {
    "schemaVersion": 1,
    "provider": "openai-codex",
    "api": "openai-codex-responses",
    "requestedModel": "gpt-6-astra",
    "responseID": "resp-example",
    "completedAt": "2026-11-04T12:00:00.000Z",
    "status": "completed",
    "evidence": [
      { "source": "response.model", "field": "model", "model": "gpt-6.2-astra" },
      { "source": "event.headers", "field": "openai-model", "model": "gpt-6.2-astra" }
    ],
    "evidenceIncomplete": false
  }
}
```

Pi also adds its normal entry ID, parent ID, and entry timestamp. The example above is illustrative,
not evidence that a real request was routed to this model.

## Fields

- `requestedModel`: model in the outgoing payload after existing transformers; null when unavailable.
- `responseID`: identifies the completed response matched to the assistant reply.
- `completedAt`: UTC completion timestamp from the collector.
- `status`: always `completed` for a saved successful-reply record.
- `evidenceIncomplete`: a capture bound or attribution ambiguity prevents a complete verdict.
- `evidence`: up to 16 distinct allowlisted model observations, preserving conflicts.

Evidence sources are `response.model`, `response.headers`, `event.headers`, and `http.headers`.
The body source uses field `model`; header sources use normalized `openai-model` or `x-openai-model`.
No other headers or payload fields are retained.

## Consumer Rules

- Join by response ID, not by the selected model, the last unrelated response, or a timestamp alone.
- Do not count copied session records twice. Deduplicate observations before aggregating usage.
- Missing evidence is unknown. Different fields or events naming different models are a conflict.
- `response.model` is not automatically equivalent to the official CLI's model-header signal.
- An identifier difference is not proof of downgrade; yellow mappings are presentation policy only.
- Reasoning tokens may already be included in output. Use the source tool's token semantics when joining usage; do not add them twice.
- The record has no account identity. A provider name alone does not establish account ownership.
- Older sessions, unsupported providers, failed requests, and internal calls may have no record at all.

Keep schema 1 backward compatible. If a future version changes the meaning or required shape, introduce
a new schema version and document migration rather than silently reinterpreting historical records.
