import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { observeProvider } from "../src/capture.ts";
import { classify } from "../src/record.ts";

const ai = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-ai")));
const { openaiCodexProvider } = await import(pathToFileURL(join(ai, "providers/openai-codex.js")).href);
const token = `fake.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "offline-fixture" } })).toString("base64")}.fake`;
const context = { messages: [{ role: "system", content: "Offline transport test", timestamp: 0 },
    { role: "user", content: "Synthetic input", timestamp: 1 }] };
function events() {
    const item = { id: "msg-test", type: "message", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] };
    const response = { id: "resp-transport", model: "gpt-6.2-astra", status: "completed", output: [item],
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 }, headers: { "openai-model": "gpt-6.2-astra" } };
    return [
        { type: "response.metadata", response_id: response.id, headers: { "x-openai-model": "gpt-6.2-astra" } },
        { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } },
        { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "OK" },
        { type: "response.output_item.done", output_index: 0, item },
        { type: "response.completed", response },
    ];
}
async function run(baseUrl, transport) {
    const original = openaiCodexProvider();
    const baseModel = original.getModels().find(m => m.id === "gpt-6-astra");
    assert.ok(baseModel);
    let saved;
    const wrapped = observeProvider(original, (_message, record) => { saved = record; }, () => assert.fail("capture error"));
    const result = await wrapped.streamSimple({ ...baseModel, baseUrl }, context,
        { apiKey: token, transport, maxRetries: 0, timeoutMs: 3000 }).result();
    await Promise.resolve();
    assert.equal(result.stopReason, "stop", result.errorMessage);
    assert.equal(result.model, "gpt-6-astra");
    assert.equal(result.content.find(c => c.type === "text")?.text, "OK");
    assert.equal(saved.requestedModel, "gpt-6-astra");
    assert.equal(saved.responseID, result.responseId);
    assert.equal(classify(saved).status, "different");
    assert.equal(classify(saved).source, "server");
    return saved;
}

test("real Codex SSE adapter preserves all model evidence without external requests", { timeout: 10_000 }, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
        assert.equal(new URL(url).hostname, "fixture.invalid");
        calls++;
        return new Response(events().map(e => `data: ${JSON.stringify(e)}\n\n`).join(""),
            { status: 200, headers: { "content-type": "text/event-stream", "openai-model": "gpt-6.2-astra" } });
    };
    try {
        const saved = await run("https://fixture.invalid/backend-api", "sse");
        assert.equal(calls, 1);
        assert.deepEqual(new Set(saved.evidence.map(e => e.source)), new Set(["response.model", "response.headers", "event.headers", "http.headers"]));
    } finally { globalThis.fetch = originalFetch; }
});

test("real Codex WebSocket adapter captures response metadata through a loopback-only server", { timeout: 10_000 }, async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const sent = [];
    server.on("connection", socket => {
        socket.on("message", bytes => {
            sent.push(JSON.parse(bytes.toString()));
            for (const event of events()) socket.send(JSON.stringify(event));
        });
    });
    try {
        const saved = await run(`http://127.0.0.1:${server.address().port}/backend-api`, "websocket");
        assert.equal(sent.length, 1);
        assert.equal(sent[0].type, "response.create");
        assert.equal(sent[0].model, "gpt-6-astra");
        assert.deepEqual(new Set(saved.evidence.map(e => e.source)), new Set(["response.model", "response.headers", "event.headers"]));
    } finally {
        for (const socket of server.clients) socket.terminate();
        await new Promise(resolve => server.close(resolve));
    }
});
