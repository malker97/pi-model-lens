import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { Container, visibleWidth } from "@earendil-works/pi-tui";
import { AssistantMessageComponent, initTheme, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { badgeText, renderEntry } from "../src/renderer.ts";
import { record } from "./fixtures.mjs";

const plainTheme = { fg: (_color, text) => text };
const coloredTheme = { fg: (_color, text) => `\u001b[36m${text}\u001b[0m` };
const variants = [record(), record({ evidence: [{ source: "response.headers", field: "openai-model", model: "gpt-6.2-astra" }] }),
    record({ evidence: [] }), record({ requestedModel: null }), record({ evidenceIncomplete: true }),
    record({ evidence: [...record().evidence, { source: "event.headers", field: "openai-model", model: "gpt-6.2-astra" }] })];

test("normal badges show requested/returned identifiers, comparison, and evidence strength", () => {
    assert.match(badgeText(variants[0], 160), /Req: gpt-6-astra → Resp: gpt-6-astra \[Match · Body\]/);
    assert.match(badgeText(variants[1], 160), /Resp: gpt-6\.2-astra \[Different · Server\]/);
    assert.match(badgeText(variants[2], 160), /Resp: \? \[Unknown\]/);
    assert.match(badgeText(variants[4], 160), /Resp: \? \[Incomplete\]/);
    assert.match(badgeText(variants[5], 160), /Resp: conflict \[Conflict\]/);
});

test("all states fit and align right across 0–180 columns, including ANSI styling", () => {
    for (const data of [...variants, record({ requestedModel: "a".repeat(256) })]) {
        for (const theme of [plainTheme, coloredTheme]) {
            const view = renderEntry({ data }, { expanded: false }, theme);
            for (let width = 0; width <= 180; width++) {
                const lines = view.render(width);
                assert.ok(lines.every(line => visibleWidth(line) <= width), `overflow at ${width}`);
                if (width > 0) assert.equal(visibleWidth(lines[0]), width);
                else assert.deepEqual(lines, []);
            }
        }
    }
});

test("narrow layouts retain both model-version prefixes instead of only the request", () => {
    const text = badgeText(variants[1], 36);
    assert.match(text, /gpt-6/);
    assert.match(text, /gpt-6\.2/);
    assert.match(text, /→/);
    assert.match(text, /≠/);
});

test("expanded detail shows both conflicting fields and wraps instead of overflowing", () => {
    const view = renderEntry({ data: variants[5] }, { expanded: true }, plainTheme);
    const lines = view.render(60);
    assert.ok(lines.length > 1);
    assert.match(lines.join("\n"), /response.model: gpt-6-astra/);
    assert.match(lines.join("\n"), /event.headers.openai-model: gpt-6.2-astra/);
    assert.match(lines.join("\n"), /resp-test/);
    assert.ok(lines.every(line => visibleWidth(line) <= 60));
});

test("invalid history displays a warning and cannot inject terminal control sequences", () => {
    const bad = record({ requestedModel: "x\u001b[2J" });
    const lines = renderEntry({ data: bad }, { expanded: true }, plainTheme).render(80);
    assert.match(lines.join(""), /Invalid Metadata/);
    assert.doesNotMatch(lines.join(""), /\u001b|x\[/);
});

test("rendering and cache invalidation never mutate session metadata", () => {
    const data = record(); const before = JSON.stringify(data);
    const view = renderEntry({ data }, { expanded: true }, coloredTheme);
    const first = view.render(100);
    assert.equal(view.render(100), first);
    view.invalidate();
    assert.deepEqual(view.render(100), first);
    assert.equal(JSON.stringify(data), before);
});

// These host checks intentionally exercise Pi's actual insertion method, not a reimplementation.
const host = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
const { InteractiveMode } = await import(pathToFileURL(join(host, "modes/interactive/interactive-mode.js")).href);
const { CustomEntryComponent } = await import(pathToFileURL(join(host, "modes/interactive/components/custom-entry.js")).href);

function testMode() {
    const mode = Object.create(InteractiveMode.prototype);
    Object.defineProperty(mode, "session", { value: { extensionRunner: { getEntryRenderer: () => renderEntry } } });
    mode.chatContainer = new Container(); mode.toolOutputExpanded = false; mode.outputPad = 1;
    mode.hideThinkingBlock = false; mode.hiddenThinkingLabel = "Thinking...";
    mode.getMarkdownThemeWithSettings = () => getMarkdownTheme(); mode.getMarkdownTransformers = () => [];
    return mode;
}

for (const theme of ["dark", "light"]) {
    test(`Pi 1.5 places a completed badge above the reply and restores it identically (${theme})`, () => {
        initTheme(theme, false);
        const message = { role: "assistant", provider: "openai-codex", api: "openai-codex-responses", model: "gpt-6-astra",
            responseId: "resp-test", content: [{ type: "text", text: "Synthetic response body. 中文宽字符测试。" }],
            stopReason: "stop", timestamp: 1 };
        const before = JSON.stringify(message);
        const entry = { type: "custom", customType: "openusage.model-routing", id: "entry-test", parentId: null,
            timestamp: "2026-11-04T12:00:00Z", data: record() };
        const live = testMode();
        live.streamingComponent = new AssistantMessageComponent(message);
        live.chatContainer.addChild(live.streamingComponent);
        live.addCustomEntryToChat(entry);
        assert.ok(live.chatContainer.children[0] instanceof CustomEntryComponent);
        assert.equal(live.chatContainer.children[1], live.streamingComponent);
        const restored = testMode();
        restored.addCustomEntryToChat(entry); restored.addMessageToChat(message);
        for (const width of [30, 60, 100, 160]) {
            const lines = live.chatContainer.render(width);
            assert.deepEqual(lines, restored.chatContainer.render(width));
            assert.ok(lines.every(line => visibleWidth(line) <= width));
            const plain = lines.map(stripVTControlCharacters);
            const labelIndex = plain.findIndex(line => line.includes("gpt-6") || line.includes("Req:"));
            const bodyIndex = plain.findIndex(line => line.includes("Synthetic"));
            assert.ok(labelIndex >= 0 && labelIndex < bodyIndex);
        }
        assert.equal(JSON.stringify(message), before);
    });
}
