import assert from "node:assert/strict";
import test from "node:test";
import { classify, ENTRY_TYPE, identifier, parseRecord, routingSummary } from "../src/record.ts";

import { record } from "./fixtures.mjs";
const header = model => ({ source: "event.headers", field: "x-openai-model", model });

test("matching response-body identifiers are a body-only match, not weight verification", () => {
    assert.deepEqual(classify(record()), { status: "match", source: "body", responseModel: "gpt-6-astra", incomplete: false });
    assert.match(routingSummary(record()), /Comparison: match/);
    assert.doesNotMatch(routingSummary(record()), /verified/i);
});

test("different returned identifiers are not automatically called downgrades", () => {
    const value = record({ evidence: [header("gpt-6.2-astra")] });
    assert.deepEqual(classify(value), { status: "different", source: "server", responseModel: "gpt-6.2-astra", incomplete: false });
    assert.doesNotMatch(routingSummary(value), /downgrade|rerouted|verified/i);
});

test("agreement across body and header is labelled server metadata", () => {
    const value = record(); value.evidence.push(header("gpt-6-astra"));
    assert.equal(classify(value).status, "match");
    assert.equal(classify(value).source, "server");
});

test("conflict wins over a matching field", () => {
    const value = record(); value.evidence.push(header("gpt-6.2-astra"));
    assert.equal(classify(value).status, "conflict");
    assert.equal(classify(value).responseModel, null);
    assert.match(routingSummary(value), /gpt-6\.2-astra/);
    assert.match(routingSummary(value), /response.model: gpt-6-astra/);
});

test("missing requested or returned identifiers are Unknown", () => {
    assert.equal(classify(record({ requestedModel: null })).status, "unknown");
    assert.equal(classify(record({ evidence: [] })).status, "unknown");
    assert.equal(classify(record({ evidence: [] })).responseModel, null);
});

test("incomplete evidence cannot declare a match or mismatch", () => {
    for (const evidence of [record().evidence, [header("other-model")]]) {
        assert.deepEqual(classify(record({ evidence, evidenceIncomplete: true })), {
            status: "unknown", source: evidence[0].source === "response.model" ? "body" : "server",
            responseModel: null, incomplete: true,
        });
    }
});

test("model identifiers are compared verbatim; no invented alias or snapshot equivalence", () => {
    for (const model of ["gpt-6-astra-2026-11-04", "GPT-6-ASTRA", "gpt-6.2-astra"]) {
        assert.equal(classify(record({ evidence: [header(model)] })).status, "different");
    }
});

test("record decoder preserves the OpenUsage v1 contract and drops unrelated fields", () => {
    const value = { ...record(), secret: "never retained", content: ["never retained"] };
    assert.deepEqual(parseRecord(value), record());
    assert.equal(ENTRY_TYPE, "openusage.model-routing");
    assert.deepEqual(parseRecord(JSON.parse(JSON.stringify(record()))), record());
    assert.equal(parseRecord(record({ completedAt: "2026-11-04T12:00:00Z" })).completedAt, record().completedAt);
});

test("invalid or unsafe persisted metadata is rejected at the boundary", () => {
    for (const value of [null, [], {}, record({ schemaVersion: 2 }), record({ schemaVersion: true }),
        record({ provider: "other" }), record({ status: "failed" }), record({ completedAt: "bad date" }),
        record({ requestedModel: "secret\nnewline" }), record({ responseID: "resp\u001b[2J" }),
        record({ evidenceIncomplete: "false" }), record({ evidence: Array(17).fill(header("gpt-6-astra")) }),
        record({ evidence: [header(42)] }), record({ evidence: [{...header("x"),source:["event.headers"]}] }),
        record({ evidence: [{...header("x"),field:["x-openai-model"]}] }),
        record({ evidence: [{...header("x"),source:"untrusted"}] }),
        record({ evidence: [{source:"response.model",field:"authorization",model:"x"}] }),
    ]) assert.equal(parseRecord(value), undefined, JSON.stringify(value));
});

test("model identifiers reject terminal escapes, controls, Unicode spoofing and oversized values", () => {
    for (const value of ["", "x\n", "x\r", "x\t", "x\u001b[31m", "x\u202e", "ｇｐｔ", " x", "x ", "x".repeat(257), 42, null]) {
        assert.equal(identifier(value), undefined);
    }
    assert.equal(identifier("openai/gpt-6.2-astra:2026-11-04"), "openai/gpt-6.2-astra:2026-11-04");
});
