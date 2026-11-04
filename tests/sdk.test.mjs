import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream, InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import lens from "../src/index.ts";
import { classify, ENTRY_TYPE, parseRecord } from "../src/record.ts";

// No real credential store, session files, global extensions, or provider transport is used here.
test("real Pi SDK persists badges before replies without sending them back in model context", { timeout: 20_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-model-lens-sdk-"));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Network is forbidden in this SDK fixture"); };
    let session;
    try {
        const model = { id: "gpt-6-astra", name: "Offline Fixture", provider: "openai-codex", api: "openai-codex-responses",
            baseUrl: "https://invalid.example", input: ["text"], reasoning: false, contextWindow: 100_000, maxTokens: 1000,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
        const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(),
            modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
        const contexts = [];
        let call = 0;
        function fakeStream(model, context, options) {
            assert.equal(options.apiKey, "offline-test-key");
            contexts.push(JSON.parse(JSON.stringify(context)));
            const sequence = ++call;
            const reported = sequence === 1 ? model.id : "gpt-6.2-astra";
            const output = { role: "assistant", api: model.api, provider: model.provider, model: model.id,
                responseId: `resp-sdk-${sequence}`, timestamp: Date.now(), content: [], stopReason: "pending",
                usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
            const stream = createAssistantMessageEventStream();
            queueMicrotask(async () => {
                try {
                    const body = { model: model.id, input: context.messages };
                    const replacement = await options.onPayload?.(body, model);
                    assert.equal((replacement === undefined ? body : replacement).model, model.id);
                    await options.onResponse?.({ status: 200, headers: sequence === 1 ? {} : { "openai-model": reported } }, model);
                    await options.onProviderStreamEvent?.({ type: "response.created",
                        response: { id: output.responseId, status: "in_progress", model: reported } }, model);
                    stream.push({ type: "start", partial: output });
                    output.content.push({ type: "text", text: `Synthetic answer ${sequence}.` });
                    await options.onProviderStreamEvent?.({ type: "response.completed",
                        response: { id: output.responseId, status: "completed", model: reported } }, model);
                    output.stopReason = "stop";
                    stream.push({ type: "done", reason: "stop", message: output });
                    stream.end(output);
                } catch (error) {
                    output.stopReason = "error"; output.errorMessage = String(error);
                    stream.push({ type: "error", reason: "error", error: output }); stream.end(output);
                }
            });
            return stream;
        }
        runtime.registerNativeProvider({ id: "openai-codex", name: "Offline Fixture", getModels: () => [model],
            auth: { apiKey: { name: "Offline", resolve: async () => ({ auth: { apiKey: "offline-test-key" }, source: "test" }) } },
            stream: fakeStream, streamSimple: fakeStream });
        const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false },
            cacheWarming: "off", packages: [], enableAnalytics: false });
        const loader = new DefaultResourceLoader({ cwd: dir, agentDir: dir, settingsManager: settings,
            noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
            extensionFactories: [lens] });
        await loader.reload();
        const errors = [];
        ({ session } = await createAgentSession({ cwd: dir, agentDir: dir, model, modelRuntime: runtime,
            settingsManager: settings, resourceLoader: loader, sessionManager: SessionManager.inMemory(dir), noTools: true }));
        await session.bindExtensions({ mode: "print", onError: error => errors.push(error) });
        await session.prompt("First synthetic prompt.");
        await session.prompt("Second synthetic prompt.");
        assert.deepEqual(errors, []);
        assert.equal(call, 2);
        const entries = session.sessionManager.getEntries();
        const badges = entries.filter(e => e.type === "custom" && e.customType === ENTRY_TYPE);
        assert.equal(badges.length, 2);
        assert.equal(classify(parseRecord(badges[0].data)).status, "match");
        assert.equal(classify(parseRecord(badges[1].data)).status, "different");
        for (const badge of badges) {
            const replyIndex = entries.findIndex(e => e.type === "message" && e.message.responseId === badge.data.responseID);
            assert.ok(entries.indexOf(badge) < replyIndex);
        }
        assert.equal(session.getLastAssistantText(), "Synthetic answer 2.");
        assert.doesNotMatch(JSON.stringify(contexts), /openusage.model-routing|Comparison:|Req:|\[Match|Server Model Metadata/);
        const assistants = session.messages.filter(m => m.role === "assistant");
        assert.deepEqual(assistants.map(m => m.model), [model.id, model.id]);
        assert.deepEqual(assistants.map(m => m.content), [[{ type: "text", text: "Synthetic answer 1." }], [{ type: "text", text: "Synthetic answer 2." }]]);
    } finally {
        session?.dispose();
        globalThis.fetch = originalFetch;
        await rm(dir, { recursive: true, force: true });
    }
});
