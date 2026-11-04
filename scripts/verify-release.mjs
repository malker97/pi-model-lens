import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function releaseInfo(tag, manifest, lock, changelog) {
    // shortcut: stable tags only; add explicit dist-tag handling before supporting prereleases.
    const match = typeof tag === "string" && /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
    if (!match || match[0] !== tag) throw new Error("Release ref must be a stable vX.Y.Z tag");
    const version = tag.slice(1);
    if (manifest.name !== "pi-model-lens" || manifest.version !== version
        || lock.version !== version || lock.packages?.[""]?.version !== version) {
        throw new Error("Tag, package.json, and package-lock.json versions must match");
    }
    if (manifest.private === true || manifest.license !== "MIT"
        || manifest.publishConfig?.access !== "public"
        || manifest.publishConfig?.registry !== "https://registry.npmjs.org/") {
        throw new Error("Package must declare the expected public npm registry and MIT license");
    }
    const lines = changelog.split(/\r?\n/);
    const header = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\](?:\\s.*)?$`);
    const start = lines.findIndex(line => header.test(line));
    if (start < 0) throw new Error("CHANGELOG.md needs a section for the release version");
    let end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
    if (end < 0) end = lines.length;
    const notes = lines.slice(start + 1, end).join("\n").trim();
    if (!notes) throw new Error("Release notes must not be empty");
    return { tag, version, filename: `pi-model-lens-${version}.tgz`, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2);
        if (args.length < 1 || args.length > 2 || (args[1] !== undefined && args[1] !== "--notes")) {
            throw new Error("Usage: node scripts/verify-release.mjs vX.Y.Z [--notes]");
        }
        const json = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
        const info = releaseInfo(args[0], json("package.json"), json("package-lock.json"),
            readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"));
        console.log(args[1] === "--notes" ? info.notes : info.version);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
