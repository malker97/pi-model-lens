import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { releaseInfo } from "../scripts/verify-release.mjs";

const manifest = { name: "pi-model-lens", version: "0.0.1", license: "MIT",
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" } };
const lock = { version: "0.0.1", packages: { "": { version: "0.0.1" } } };
const changelog = "# Changelog\n\n## Unreleased\n\n## [0.0.1] - 2026-11-04\n\n- Initial release.\n\n## [0.0.0]\n\n- Old notes.\n";

test("release metadata matches the approved stable tag and extracts only its notes", () => {
    assert.deepEqual(releaseInfo("v0.0.1", manifest, lock, changelog), {
        tag: "v0.0.1", version: "0.0.1", filename: "pi-model-lens-0.0.1.tgz", notes: "- Initial release.",
    });
});

test("release refs reject branches, prereleases, malformed tags, and shell-like input", () => {
    for (const tag of ["main", "0.0.1", "v00.0.1", "v0.0.1-beta.1", "v0.0.1\n", "v0.0.1; echo unsafe", "--help", undefined]) {
        assert.throws(() => releaseInfo(tag, manifest, lock, changelog), /stable vX.Y.Z/);
    }
});

test("release versions must agree in the manifest and both lockfile locations", () => {
    assert.throws(() => releaseInfo("v0.0.2", manifest, lock, changelog), /versions must match/);
    assert.throws(() => releaseInfo("v0.0.1", manifest, { ...lock, version: "0.0.0" }, changelog), /versions must match/);
    assert.throws(() => releaseInfo("v0.0.1", manifest, { ...lock, packages: {} }, changelog), /versions must match/);
    assert.throws(() => releaseInfo("v0.0.1", { ...manifest, name: "wrong-package" }, lock, changelog), /versions must match/);
});

test("private packages, unexpected registries, and empty changelogs cannot release", () => {
    assert.throws(() => releaseInfo("v0.0.1", { ...manifest, private: true }, lock, changelog), /public npm registry/);
    assert.throws(() => releaseInfo("v0.0.1", { ...manifest, publishConfig: { access: "public", registry: "https://example.com" } }, lock, changelog), /public npm registry/);
    assert.throws(() => releaseInfo("v0.0.1", manifest, lock, "## [0.0.1]\n\n"), /must not be empty/);
    assert.throws(() => releaseInfo("v0.0.1", manifest, lock, "## Unreleased\n- not released"), /needs a section/);
});

test("the repository release metadata validates as shipped", async () => {
    const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");
    const pkg = JSON.parse(await read("package.json"));
    const info = releaseInfo(`v${pkg.version}`, pkg, JSON.parse(await read("package-lock.json")), await read("CHANGELOG.md"));
    assert.ok(info.notes.length > 20);
});
