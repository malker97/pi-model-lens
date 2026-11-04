import assert from "node:assert/strict";
import test from "node:test";
import { readFile, access } from "node:fs/promises";

test("release package declares its public metadata and keeps Pi packages as peers", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.name, "pi-model-lens");
    assert.notEqual(manifest.private, true);
    assert.equal(manifest.license, "MIT");
    assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
    assert.ok(manifest.keywords.includes("pi-package"));
    assert.deepEqual(manifest.files, ["src", "docs", "README.md", "README.zh-CN.md", "CONTRIBUTING.md", "CHANGELOG.md", "LICENSE", "SECURITY.md"]);
    assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    for (const name of ["pi-ai", "pi-coding-agent", "pi-tui"]) {
        assert.equal(manifest.peerDependencies[`@earendil-works/${name}`], "*");
    }
    await access(new URL("../src/index.ts", import.meta.url));
});
