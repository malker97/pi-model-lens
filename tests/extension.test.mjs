import assert from "node:assert/strict";
import test from "node:test";
import lens from "../src/index.ts";
import { ENTRY_TYPE } from "../src/record.ts";
import { record } from "./fixtures.mjs";

function harness(extraCommands = []) {
    const handlers = new Map(), commands = new Map(), renderers = new Map(), notices = [], entries = [];
    let registered;
    const api = {
        on: (name, handler) => handlers.set(name, handler),
        registerCommand: (name, command) => commands.set(name, command),
        registerEntryRenderer: (name, renderer) => renderers.set(name, renderer),
        registerProvider: value => { registered = value; },
        appendEntry: (type, data) => entries.push({ type: "custom", customType: type, data }),
        getCommands: () => [...commands.keys()].map(name => ({ name, source: "extension" })).concat(extraCommands),
    };
    const context = {
        ui: { notify: (text, level) => notices.push({ text, level }) },
        modelRegistry: { getProvider: () => ({ id: "openai-codex", streamSimple() {} }) },
        sessionManager: { getEntries: () => entries },
    };
    lens(api);
    return { handlers, commands, renderers, notices, entries, context, registered: () => registered };
}

test("registers a renderer and both command names without making a model call", () => {
    const h = harness();
    assert.ok(h.renderers.has(ENTRY_TYPE));
    assert.ok(h.commands.has("model-lens"));
    assert.ok(h.commands.has("openusage-routing"));
    assert.equal(h.registered(), undefined);
});

test("legacy or duplicated collectors pause capture instead of double-recording", () => {
    for (const name of ["openusage-routing:2", "model-lens:2"]) {
        const h = harness([{ name, source: "extension" }]);
        h.handlers.get("session_start")({}, h.context);
        assert.equal(h.registered(), undefined);
        assert.match(h.notices[0].text, /Multiple/);
        assert.equal(h.notices[0].level, "warning");
    }
});

test("a similarly named prompt template is not mistaken for a duplicate collector", () => {
    const h = harness([{ name: "model-lens", source: "prompt" }]);
    h.handlers.get("session_start")({}, h.context);
    assert.ok(h.registered());
    assert.deepEqual(h.notices, []);
});

test("an unavailable provider is reported without changing other providers", () => {
    const h = harness(); h.context.modelRegistry.getProvider = () => undefined;
    h.handlers.get("session_start")({}, h.context);
    assert.equal(h.registered(), undefined);
    assert.match(h.notices[0].text, /unavailable/);
});

test("diagnostics read existing records; malformed history fails visibly", async () => {
    const h = harness(); const command = h.commands.get("model-lens");
    await command.handler("", h.context);
    assert.match(h.notices.at(-1).text, /No completed/);
    h.entries.push({ type: "custom", customType: ENTRY_TYPE, data: record() });
    await command.handler("", h.context);
    assert.match(h.notices.at(-1).text, /Comparison: match/);
    h.entries.push({ type: "custom", customType: ENTRY_TYPE, data: { evidence: "malformed" } });
    await h.commands.get("openusage-routing").handler("", h.context);
    assert.equal(h.notices.at(-1).level, "error");
    assert.equal(h.entries.length, 2);
});

test("shutdown ignores late completions and cannot append to the next session", async () => {
    const h = harness(); let hooks, complete;
    h.context.modelRegistry.getProvider = () => ({ id: "openai-codex", streamSimple(_model, _context, options) {
        hooks = options;
        const result = new Promise(resolve => { complete = resolve; });
        return { result: () => result };
    } });
    h.handlers.get("session_start")({}, h.context);
    const model = { id: "gpt-6-astra", provider: "openai-codex", api: "openai-codex-responses" };
    h.registered().streamSimple(model, {}, {});
    await hooks.onPayload({ model: model.id }, model);
    await hooks.onProviderStreamEvent({ type: "response.completed", response: { id: "resp-test", status: "completed", model: model.id } }, model);
    h.handlers.get("session_shutdown")({});
    const message = { role: "assistant", ...model, model: model.id, responseId: "resp-test", stopReason: "stop", timestamp: 1 };
    complete(message); await Promise.resolve();
    h.handlers.get("message_end")({ message });
    assert.deepEqual(h.entries, []);
});
