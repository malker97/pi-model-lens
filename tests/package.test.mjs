import assert from "node:assert/strict";
import test from "node:test";
import { readFile, access } from "node:fs/promises";

test("package is installable locally, keeps Pi packages as peers, and blocks npm publication", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.name, "pi-model-lens");
    assert.equal(manifest.private, true, "publication needs explicit approval before removing this guard");
    assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    for (const name of ["pi-ai", "pi-coding-agent", "pi-tui"]) {
        assert.equal(manifest.peerDependencies[`@earendil-works/${name}`], "*");
    }
    await access(new URL("../src/index.ts", import.meta.url));
});
