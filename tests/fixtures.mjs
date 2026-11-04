export function record(overrides = {}) {
    return { schemaVersion: 1, provider: "openai-codex", api: "openai-codex-responses",
        requestedModel: "gpt-6-astra", responseID: "resp-test", completedAt: "2026-11-04T12:00:00.000Z",
        status: "completed", evidence: [{ source: "response.model", field: "model", model: "gpt-6-astra" }],
        evidenceIncomplete: false, ...overrides };
}
