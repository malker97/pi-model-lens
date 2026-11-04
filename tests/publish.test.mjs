import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/publish-npm.yml", import.meta.url), "utf8");
const block = workflow.match(/      - name: Publish the verified package with OIDC[\s\S]*?        run: \|\n([\s\S]*)$/)?.[1];
assert.ok(block, "Test the real publish workflow shell, not a separate implementation");
assert.ok(block.split("\n").every(line => !line || line.startsWith("          ")));
const shell = block.split("\n").map(line => line.slice(10)).join("\n");

test("npm workflow stays manual, defaults to dry-run, and keeps the publication gates", () => {
    assert.match(workflow, /\non:\n  workflow_dispatch:\n/);
    assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|release|schedule|workflow_run):/m);
    assert.match(workflow, /dry_run:[\s\S]*?default: true/);
    assert.match(workflow, /if: \$\{\{ !inputs\.dry_run && vars\.NPM_PUBLISH_ENABLED == 'true' \}\}/);
    assert.match(workflow, /environment: npm/);
});

async function simulate(scenario) {
    const root = await mkdtemp(join(tmpdir(), "model-lens-publish-test-"));
    try {
        const bin = join(root, "bin");
        await mkdir(bin);
        await mkdir(join(root, "dist"));
        const content = Buffer.from("offline synthetic package, not a real npm archive");
        await writeFile(join(root, "dist/pi-model-lens-0.0.1.tgz"), content);
        const integrity = `sha512-${createHash("sha512").update(content).digest("base64")}`;
        const mock = `#!/usr/bin/env node
const fs = require("node:fs");
const root = process.env.MOCK_ROOT;
const args = process.argv.slice(2);
const statePath = root + "/state.json";
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : { views: 0, publishes: 0 };
const scenario = process.env.MOCK_SCENARIO;
if (args[0] === "publish") {
    state.publishes++;
    fs.writeFileSync(statePath, JSON.stringify(state));
    process.exit(0);
}
if (args[0] !== "view") throw new Error("Unexpected fake npm invocation");
state.views++;
fs.writeFileSync(statePath, JSON.stringify(state));
if (scenario === "network" || scenario === "never" || (scenario === "new" && state.views < 3)) {
    console.log(JSON.stringify({ error: { code: scenario === "network" ? "E503" : "E404" } }));
    process.exit(1);
}
const value = scenario === "mismatch" ? "sha512-different" : process.env.MOCK_INTEGRITY;
console.log(args.includes("--json") ? JSON.stringify(value) : value);
`;
        for (const [name, body] of Object.entries({
            npm: mock,
            sleep: "#!/bin/sh\nexit 0\n",
            sha256sum: '#!/bin/sh\nexec shasum -a 256 "$@"\n',
        })) {
            await writeFile(join(bin, name), body);
            await chmod(join(bin, name), 0o755);
        }
        const result = spawnSync("bash", ["-euo", "pipefail", "-c", shell], {
            cwd: root, encoding: "utf8", timeout: 10000,
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERSION: "0.0.1",
                DIGEST: createHash("sha256").update(content).digest("hex"),
                MOCK_ROOT: root, MOCK_SCENARIO: scenario, MOCK_INTEGRITY: integrity },
        });
        assert.equal(result.error, undefined);
        const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
        return { ...state, status: result.status, output: result.stdout + result.stderr };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

const posix = { skip: process.platform === "win32" ? "GitHub release shell targets POSIX runners" : false };

test("publish workflow retries registry lag and verifies exact package integrity", posix, async () => {
    const result = await simulate("new");
    assert.equal(result.status, 0, result.output);
    assert.equal(result.publishes, 1);
    assert.equal(result.views, 3);
});

test("publish workflow reruns accept an identical already-published package without republishing", posix, async () => {
    const result = await simulate("existing");
    assert.equal(result.status, 0, result.output);
    assert.equal(result.publishes, 0);
});

test("publish workflow refuses mismatched bytes and ambiguous registry failures", posix, async () => {
    for (const scenario of ["mismatch", "network"]) {
        const result = await simulate(scenario);
        assert.notEqual(result.status, 0);
        assert.equal(result.publishes, 0);
    }
});

test("publish workflow reports bounded verification failure rather than publishing twice", posix, async () => {
    const result = await simulate("never");
    assert.notEqual(result.status, 0);
    assert.equal(result.publishes, 1);
    assert.equal(result.views, 6);
    assert.match(result.output, /registry verification timed out/);
});
