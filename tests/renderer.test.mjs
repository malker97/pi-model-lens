import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { Container, visibleWidth } from "@earendil-works/pi-tui";
import { AssistantMessageComponent, initTheme, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { badgeText, badgeTone, renderEntry } from "../src/renderer.ts";
import { record } from "./fixtures.mjs";

const plainTheme = { fg: (_color, text) => text };
const coloredTheme = { fg: (_color, text) => `\u001b[36m${text}\u001b[0m` };
const variants = [record(), record({ evidence: [{ source: "response.headers", field: "openai-model", model: "gpt-6.2-astra" }] }),
    record({ evidence: [] }), record({ requestedModel: null }), record({ evidenceIncomplete: true }),
    record({ evidence: [...record().evidence, { source: "event.headers", field: "openai-model", model: "gpt-6.2-astra" }] })];

test("collapsed badges contain only the response model and a dot", () => {
    assert.equal(badgeText(variants[0], 160), "gpt-6-astra ●");
    assert.equal(badgeText(variants[1], 160), "gpt-6.2-astra ●");
    assert.equal(badgeText(variants[2], 160), "Unknown ●");
    assert.equal(badgeText(variants[3], 160), "gpt-6-astra ●");
    assert.equal(badgeText(variants[4], 160), "Unknown ●");
    assert.equal(badgeText(variants[5], 160), "Unknown ●");
    for (const data of variants) assert.doesNotMatch(badgeText(data, 160), /Req:|Resp:|Match|Body|Server|→/);
});

test("lights are green for matches, yellow only for the agreed upgrade, red for other differences", () => {
    assert.equal(badgeTone(variants[0]), "success");
    assert.equal(badgeTone(variants[1]), "warning");
    const response = (model, requestedModel = "gpt-6-astra") => record({ requestedModel,
        evidence: [{ source: "response.model", field: "model", model }] });
    assert.equal(badgeTone(response("gpt-6.2-astra")), "warning");
    assert.equal(badgeTone(response("gpt-6.1-sol")), "error", "cross-family differences are red");
    assert.equal(badgeTone(response("gpt-6-astra", "gpt-6.2-astra")), "error");
    assert.equal(badgeTone(response("gpt-7-astra")), "error", "larger version numbers do not invent upgrades");
});

test("missing, incomplete, conflicting and invalid metadata remain gray", () => {
    for (const data of [variants[2], variants[3], variants[4], variants[5], undefined]) {
        assert.equal(badgeTone(data), "dim");
    }
});

test("only the dot receives the status color; the model text stays neutral", () => {
    for (const [data, tone] of [[variants[0], "success"], [variants[1], "warning"], [variants[5], "dim"],
        [record({ evidence: [{ source: "response.model", field: "model", model: "gpt-6.1-sol" }] }), "error"]]) {
        const calls = [];
        const theme = { fg: (color, text) => { calls.push({ color, text }); return text; } };
        renderEntry({ data }, { expanded: false }, theme).render(100);
        assert.equal(calls[0].color, "dim");
        assert.deepEqual(calls[1], { color: tone, text: "●" });
        assert.equal(calls.length, 2);
    }
});

test("all states fit and align right across 0–180 columns, including ANSI styling", () => {
    for (const data of [...variants, record({ evidence: [{ source: "response.model", field: "model", model: "a".repeat(256) }] })]) {
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

test("narrow layouts prioritize the response version and retain the light", () => {
    const text = badgeText(variants[1], 10);
    assert.match(text, /gpt-6\.2/);
    assert.ok(text.endsWith(" ●"));
    assert.ok(visibleWidth(text) <= 10);
    assert.equal(badgeText(variants[1], 1), "●");
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
            const labelIndex = plain.findIndex(line => line.includes("gpt-6-astra") && line.includes("●"));
            const bodyIndex = plain.findIndex(line => line.includes("Synthetic"));
            assert.ok(labelIndex >= 0 && labelIndex < bodyIndex);
        }
        assert.equal(JSON.stringify(message), before);
    });
}
