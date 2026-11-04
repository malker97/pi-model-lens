import assert from "node:assert/strict";
import { test } from "node:test";
import routingExtension from "../src/index.ts";
import { RoutingCapture, observeProvider } from "../src/capture.ts";
import { ENTRY_TYPE, routingSummary } from "../src/record.ts";

const model = { id: "gpt-6-astra", provider: "openai-codex", api: "openai-codex-responses" };
const date = new Date("2026-11-04T12:00:00Z");
const message = (id = "resp-main", extra = {}) => ({
    role: "assistant", provider: model.provider, api: model.api, model: model.id,
    responseId: id, stopReason: "stop", timestamp: 1, ...extra,
});
const event = (id = "resp-main", extra = {}, type = "response.completed") => ({
    type, response: { id, status: "completed", model: "gpt-6.2-astra", ...extra },
});
async function capture(options) {
    const result = new RoutingCapture(() => date);
    const hooks = result.options(options);
    await hooks.onPayload({ model: model.id, input: "private prompt" }, model);
    return { result, hooks };
}

test("preserves distinct requested, response-body, and official header model evidence", async () => {
    const { result } = await capture();
    result.event(event("resp-main", { headers: { "OpenAI-Model": "gpt-6.2-astra", Authorization: "secret" } }));
    const record = result.finish(message());
    assert.equal(record.requestedModel, "gpt-6-astra");
    assert.equal(record.completedAt, date.toISOString());
    assert.deepEqual(record.evidence, [
        { source: "response.headers", field: "openai-model", model: "gpt-6.2-astra" },
        { source: "response.model", field: "model", model: "gpt-6.2-astra" },
    ]);
    assert.match(routingSummary(record), /^Server Model Metadata/);
});

test("observes the final transformed payload without replacing it or using the picker", async () => {
    const transformed = { model: "gpt-6.1-sol", input: "keep this unchanged" };
    const { result, hooks } = await capture({ onPayload: async () => transformed });
    assert.equal(await hooks.onPayload({ model: model.id }, model), transformed);
    result.event(event());
    assert.equal(result.finish(message()).requestedModel, transformed.model);
});

test("an explicit null payload replacement is passed through, not replaced by the original", async () => {
    const { result, hooks } = await capture({ onPayload: () => null });
    assert.equal(await hooks.onPayload({ model: model.id }, model), null);
    result.event(event());
    assert.equal(result.finish(message()).requestedModel, null);
});

test("missing model fields stay Unknown rather than echoing the requested model", async () => {
    const { result } = await capture();
    result.event(event("resp-main", { model: undefined }));
    const record = result.finish(message());
    assert.deepEqual(record.evidence, []);
    assert.match(routingSummary(record), /^Unknown/);
});

test("response.model without official metadata is explicitly weaker evidence", async () => {
    const { result } = await capture();
    result.event(event());
    assert.match(routingSummary(result.finish(message())), /^Response Model Field Only/);
});

test("conflicting fields are retained, not silently resolved by header precedence", async () => {
    const { result } = await capture();
    result.event({ ...event("resp-main", { headers: { "openai-model": "gpt-6-astra" } }),
        headers: { "X-OpenAI-Model": "gpt-6.1-sol" } });
    const record = result.finish(message());
    assert.match(routingSummary(record), /^Conflicting Model Fields/);
    assert.deepEqual(new Set(record.evidence.map(item => item.model)),
        new Set(["gpt-6-astra", "gpt-6.1-sol", "gpt-6.2-astra"]));
});

test("model changes between created and completed events remain visible", async () => {
    const { result } = await capture();
    result.event(event("resp-main", { status: "in_progress", model: "gpt-6-astra" }, "response.created"));
    result.event(event());
    assert.match(routingSummary(result.finish(message())), /^Conflicting Model Fields/);
});

test("repeated evidence does not duplicate the record", async () => {
    const { result } = await capture();
    result.event(event()); result.event(event());
    assert.equal(result.finish(message()).evidence.length, 1);
});

test("metadata events are associated by response_id, including out-of-order metadata", async () => {
    const { result } = await capture();
    result.event({ type: "response.metadata", response_id: "resp-main", headers: { "X-OpenAI-Model": "gpt-6.2-astra" } });
    result.event(event("resp-other", { model: "gpt-6-luna" }));
    result.event(event());
    const record = result.finish(message());
    assert.equal(record.evidence.length, 2);
    assert.ok(record.evidence.every(item => item.model === "gpt-6.2-astra"));
});

test("ID-less metadata before response.created is scoped to this call", async () => {
    const { result } = await capture();
    result.event({ type: "response.metadata", headers: { "openai-model": "gpt-6.2-astra" } });
    result.event(event());
    assert.match(routingSummary(result.finish(message())), /^Server Model Metadata/);
});

test("multiple ID-less metadata events retain conflicting evidence", async () => {
    const { result } = await capture();
    for (const name of ["gpt-6-astra", "gpt-6.2-astra"]) {
        result.event({ type: "response.metadata", headers: { "openai-model": name } });
    }
    result.event(event());
    assert.match(routingSummary(result.finish(message())), /^Conflicting Model Fields/);
});

test("unattributable metadata between retry attempts marks the evidence incomplete", async () => {
    const { result } = await capture();
    result.event(event("resp-failed", { status: "failed" }, "response.failed"));
    result.event({ type: "response.metadata", headers: { "openai-model": "gpt-6-luna" } });
    result.event(event());
    assert.equal(result.finish(message()).evidenceIncomplete, true);
    assert.equal(result.finish(message()).evidence.length, 1);
});

test("inconsistent response IDs are not merged into a different response", async () => {
    const { result } = await capture();
    result.event({ ...event(), response_id: "resp-other" });
    assert.equal(result.finish(message()), undefined);
    result.event(event());
    assert.equal(result.finish(message()).evidenceIncomplete, true);
});

test("each response retains the request model observed when it started", async () => {
    const { result, hooks } = await capture();
    result.event(event("resp-a", { status: "in_progress" }, "response.created"));
    await hooks.onPayload({ model: "gpt-6-luna" }, model);
    result.event(event("resp-b", { model: "gpt-6-luna" }));
    result.event(event("resp-a"));
    assert.equal(result.finish(message("resp-a")).requestedModel, "gpt-6-astra");
    assert.equal(result.finish(message("resp-b")).requestedModel, "gpt-6-luna");
});

test("SSE HTTP headers are observed and original callbacks/options remain intact", async () => {
    const calls = [];
    const signal = new AbortController().signal;
    const { result, hooks } = await capture({ signal, transport: "sse", temperature: 0.5,
        onResponse: response => calls.push(response.status), onProviderStreamEvent: raw => calls.push(raw.type) });
    const raw = event();
    await hooks.onResponse({ status: 200, headers: { "openai-model": "gpt-6.2-astra" } }, model);
    await hooks.onProviderStreamEvent(raw, model);
    assert.equal(hooks.signal, signal);
    assert.equal(hooks.transport, "sse");
    assert.equal(hooks.temperature, 0.5);
    assert.deepEqual(calls, [200, "response.completed"]);
    assert.equal(raw.response.model, "gpt-6.2-astra");
    assert.ok(result.finish(message()).evidence.some(item => item.source === "http.headers"));
});

test("existing callback failures retain their behavior rather than being swallowed", async () => {
    const failure = new Error("synthetic callback failure");
    const collector = new RoutingCapture();
    const hooks = collector.options({ onPayload: () => { throw failure; },
        onResponse: () => { throw failure; }, onProviderStreamEvent: () => { throw failure; } });
    await assert.rejects(hooks.onPayload({}, model), failure);
    await assert.rejects(hooks.onResponse({ status: 200, headers: {} }, model), failure);
    await assert.rejects(hooks.onProviderStreamEvent(event(), model), failure);
});

test("headers on an HTTP failure cannot become successful response evidence", async () => {
    const { result, hooks } = await capture();
    await hooks.onResponse({ status: 429, headers: { "openai-model": "gpt-6-luna" } }, model);
    result.event(event());
    assert.deepEqual(result.finish(message()).evidence.map(item => item.source), ["response.model"]);
});

test("retry response IDs remain separate; failed warmup cannot mark the answer rerouted", async () => {
    const { result } = await capture();
    result.event(event("resp-warm", { model: "gpt-6-luna", status: "failed" }, "response.failed"));
    result.event(event("resp-main", { model: model.id }));
    assert.equal(result.finish(message()).evidence[0].model, model.id);
    assert.equal(result.finish(message("resp-warm")), undefined);
});

for (const reason of ["error", "aborted", "length", "pending", "deferred"]) {
    test(`a final assistant ${reason} result is not saved as a completed answer`, async () => {
        const { result } = await capture(); result.event(event());
        assert.equal(result.finish(message("resp-main", { stopReason: reason })), undefined);
    });
}

test("a successful tool-call response is a real completed assistant response", async () => {
    const { result } = await capture(); result.event(event());
    assert.equal(result.finish(message("resp-main", { stopReason: "toolUse" })).status, "completed");
});

test("no terminal completion or no matching ID means no confirmed record", async () => {
    const { result } = await capture();
    result.event(event("resp-main", { status: "in_progress" }, "response.created"));
    assert.equal(result.finish(message()), undefined);
    result.event(event());
    assert.equal(result.finish(message("resp-missing")), undefined);
    assert.equal(result.finish(message(undefined, { responseId: undefined })), undefined);
    assert.equal(result.finish(message("resp-main", { provider: "deepseek" })), undefined);
});

test("response.done is supported but missing/completion-conflicting status is not guessed", async () => {
    const { result } = await capture();
    result.event(event("resp-main", {}, "response.done"));
    assert.equal(result.finish(message()).status, "completed");
    result.event(event("resp-main", { status: "incomplete" }));
    assert.equal(result.finish(message()), undefined);
    result.event(event("resp-main", { status: undefined }));
    assert.equal(result.finish(message()), undefined);
});

test("stored metadata excludes content, tools, hidden reasoning, usage, and all other headers", async () => {
    const { result, hooks } = await capture();
    await hooks.onResponse({ status: 200, headers: { authorization: "secret-token", "set-cookie": "secret-cookie" } }, model);
    result.event(event("resp-main", { output: [{ text: "secret-answer" }], encrypted_content: "secret-reasoning",
        usage: { extra: "secret-usage" }, headers: { authorization: "secret-token" } }));
    const json = JSON.stringify(result.finish(message()));
    assert.doesNotMatch(json, /secret-|private prompt|encrypted_content|authorization|cookie|usage/i);
    assert.deepEqual(Object.keys(JSON.parse(json)).sort(), ["schemaVersion", "provider", "api", "requestedModel",
        "responseID", "completedAt", "status", "evidence", "evidenceIncomplete"].sort());
});

test("malformed fields and unsupported event shapes do not crash capture", async () => {
    const { result } = await capture();
    for (const bad of [null, 0, "text", [], { type: 1 }, { type: "response.metadata", headers: ["openai-model", "x"] }]) result.event(bad);
    result.event(event("resp-main", { model: "evil\ncontrol", headers: { "openai-model": 42 } }));
    assert.equal(result.finish(message()).evidence.length, 0);
});

test("bounded evidence is explicitly marked incomplete rather than hiding unseen conflicts", async () => {
    const { result } = await capture();
    for (let i = 0; i < 30; i++) result.event(event("resp-main", { model: `model-${i}` }));
    const record = result.finish(message());
    assert.equal(record.evidence.length, 16);
    assert.equal(record.evidenceIncomplete, true);
    assert.match(routingSummary(record), /^Incomplete Evidence/);
});

function providerFixture() {
    const requests = [];
    const provider = { id: "openai-codex", name: "Original", auth: { oauth: {} }, getModels: () => [model],
        streamSimple(model, context, options) {
            let resolve;
            const promise = new Promise(r => resolve = r);
            const stream = { result: () => promise };
            requests.push({ model, context, options, stream, resolve });
            return stream;
        }, stream() { throw new Error("unused"); },
    };
    return { requests, provider };
}

test("provider wrapper isolates concurrent calls and returns the original streams", async () => {
    const fixture = providerFixture(); const saved = [];
    const observed = observeProvider(fixture.provider, (message, record) => saved.push(record), () => assert.fail("unexpected error"));
    assert.equal(observed.auth, fixture.provider.auth);
    assert.equal(observed.getModels, fixture.provider.getModels);
    assert.equal(observed.stream, fixture.provider.stream);
    for (let i = 0; i < 2; i++) assert.equal(observed.streamSimple(model, {}, {}), fixture.requests[i].stream);
    const [a, b] = fixture.requests;
    await a.options.onPayload({ model: "gpt-6-astra" }, model);
    await b.options.onPayload({ model: "gpt-6-luna" }, model);
    await b.options.onProviderStreamEvent(event("resp-b", { model: "gpt-6-luna" }), model);
    await a.options.onProviderStreamEvent(event("resp-a"), model);
    b.resolve(message("resp-b")); a.resolve(message("resp-a"));
    await Promise.resolve();
    assert.deepEqual(saved.map(record => [record.responseID, record.requestedModel]),
        [["resp-b", "gpt-6-luna"], ["resp-a", "gpt-6-astra"]]);
});

test("extension persists only completed agent replies, not internal warmups or duplicates", async () => {
    const fixture = providerFixture(); const handlers = new Map(); const entries = []; let registered;
    routingExtension({ on: (name, handler) => handlers.set(name, handler), registerCommand() {},
        registerEntryRenderer() {}, getCommands: () => [],
        registerProvider: provider => { registered = provider; }, appendEntry: (type, data) => entries.push({ type, data }) });
    handlers.get("session_start")({}, { modelRegistry: { getProvider: () => fixture.provider }, ui: { notify() {} } });
    registered.streamSimple(model, {}, {}); registered.streamSimple(model, {}, {});
    const [normal, warm] = fixture.requests;
    for (const [request, id] of [[normal, "resp-main"], [warm, "resp-warm"]]) {
        await request.options.onPayload({ model: model.id }, model);
        await request.options.onProviderStreamEvent(event(id), model);
    }
    const mainMessage = message();
    normal.resolve(mainMessage); warm.resolve(message("resp-warm"));
    await Promise.resolve();
    // Other extensions may replace a message with a shallow copy; the response ID is the identity.
    handlers.get("message_end")({ message: { ...mainMessage } });
    handlers.get("message_end")({ message: mainMessage });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, ENTRY_TYPE);
    assert.equal(entries[0].data.responseID, "resp-main");
});
