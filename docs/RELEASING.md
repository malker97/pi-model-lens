# Releasing Pi Model Lens

GitHub releases and npm publication are separate. **A push to `main`, a pull request, or a version tag
never publishes to npm.** Do not publish npm without the owner's explicit approval.

## Workflow Map

| Workflow | Trigger | Result |
|---|---|---|
| `ci.yml` | Main pushes, PRs, manual dispatch | Type checks, tests, terminal smoke checks, package inspection on Node 22/24 |
| `release.yml` | Stable `vX.Y.Z` tag push, or manual dispatch from that tag | Tested `.tgz`, SHA-256 checksum, and a published GitHub release with changelog notes |
| `publish-npm.yml` | Manual dispatch from a stable tag | Validation-only by default; npm publication needs explicit opt-in and environment approval |

Release packaging is pinned to **Node 22.23.2 / npm 12.2.1**. Keep these pins consistent in both release
workflows. Reproduction checks fail closed if the released tarball differs from the tagged source;
never work around that by clobbering an asset or moving a tag. Investigate the difference first.

The workflows currently support stable tags only. Prereleases need an explicit dist-tag policy before
being added; do not publish a beta accidentally under `latest`.

## Before Making a Version Public

1. Get approval for the version number. The initial approved version is `0.0.1`.
2. Review the working tree, Git history, and packed files for real credentials, private data, and local paths.
   Making a GitHub repository public exposes its commit history, including Git author metadata.
3. Retain the MIT copyright notices; keep scope and privacy statements accurate.
4. Update `package.json`, `package-lock.json`, and a non-empty `## [VERSION]` changelog section.
5. Run:

```sh
npm ci --ignore-scripts
npm run check
npm test
python3 tests/tty-smoke.py
npm run pack:check
npm run release:check -- v0.0.1
```

Inspect `npm pack --dry-run`: only source, public documentation, license, and package metadata should
ship. No credentials, sessions, tests, local settings, or development dependency tree belongs in the tarball.

## Publish the GitHub Release

Commit the release preparation to `main`, push it, and wait for CI. Then tag the approved commit:

```sh
git tag -a v0.0.1 -m "Pi Model Lens 0.0.1"
git push origin v0.0.1
```

The GitHub Release workflow:

- rejects branch refs and malformed/non-stable tags;
- verifies that the tag's commit is already on `origin/main`;
- checks the manifest, lockfile, license, public registry, and changelog version;
- reruns type checks, tests, and real Pi terminal smoke tests;
- packs source without lifecycle scripts and tests the actual unpacked package;
- uploads `pi-model-lens-0.0.1.tgz` and its `.sha256` file;
- creates a non-draft, stable GitHub release with non-empty notes.

A rerun verifies existing assets byte-for-byte; it does not overwrite them. If a partial release lacks
assets or the bytes differ, investigate and repair deliberately rather than using a blanket `--clobber`.

To retry after a transient failure:

```sh
gh workflow run release.yml --repo malker97/pi-model-lens --ref v0.0.1
```

Verify the published release, assets, checksums, and tag commit. Users can then install directly:

```sh
pi install git:github.com/malker97/pi-model-lens@v0.0.1
```

## Validate the npm Path Without Publishing

This requires a completed GitHub release but no npm credentials:

```sh
gh workflow run publish-npm.yml --repo malker97/pi-model-lens --ref v0.0.1 -f dry_run=true
```

The prepare job downloads the released artifact, reconstructs it from the exact tag using the pinned
packaging toolchain, and compares the tarball and checksum. The publishing job is skipped. This is a
package-validation dry run, not a test of npm account permissions or OIDC authentication.

## Initial npm Account Setup

An npm account is separate from the GitHub account. For a package that has never been published, the
simplest bootstrap is for its owner to publish the already-verified GitHub tarball interactively,
**only after explicit publication approval**:

```sh
gh release download v0.0.1 --repo malker97/pi-model-lens \
  -p 'pi-model-lens-0.0.1.tgz' -p 'pi-model-lens-0.0.1.tgz.sha256'
shasum -a 256 -c pi-model-lens-0.0.1.tgz.sha256
npm login --registry=https://registry.npmjs.org/
npm publish ./pi-model-lens-0.0.1.tgz --access public --ignore-scripts --registry=https://registry.npmjs.org/
```

Use a current npm CLI and complete npm's browser/2FA confirmation yourself. Never paste an npm token
into chat or commit it to a file. Do not add `--provenance` to a local manual publish; provenance is
produced by the hosted CI publishing path. Publishing npm makes the packed source public even if a
repository were private. Published package versions cannot be reused.

The commands above are instructions, not an action performed by the GitHub release workflow. If npm's
new-package setup permits configuring trusted publication before the initial publish, the OIDC path
below can be used instead after that account-side setup is complete.

## Configure npm Trusted Publishing

On npmjs.com, configure the package's trusted publisher with these **exact, case-sensitive** values:

| Field | Value |
|---|---|
| Provider | GitHub Actions |
| Organization or user | `malker97` |
| Repository | `pi-model-lens` |
| Workflow filename | `publish-npm.yml` — not the full path |
| Environment | `npm` |
| Allowed action | Direct `npm publish` must be enabled |

Trusted publishing requires npm >=11.5.1 and Node >=22.14; our workflow pins satisfy both. It uses
GitHub-hosted runners with `id-token: write`, and the public repository permits npm provenance.
No `NPM_TOKEN` / `NODE_AUTH_TOKEN` secret is needed.

Npm currently requires a trusted-publisher configuration's first successful publish within two days
of configuration. Set it up when ready to use it; recreate an expired configuration rather than
assuming it is still active. Do not try to republish `0.0.1` if it was already bootstrapped manually.

On GitHub, configure the `npm` environment with a required maintainer reviewer and a deployment tag
policy for `v*`. The single maintainer can approve their own run. Keep the repository variable
`NPM_PUBLISH_ENABLED=false` until npm account-side setup and publication approval are complete.

Also consider a repository tag ruleset that blocks updating/deleting `v*` tags, and GitHub's immutable
releases setting where available. Do not rely on a naming convention alone to prevent retagging.

When ready for an approved, not-yet-published version:

```sh
gh variable set NPM_PUBLISH_ENABLED --repo malker97/pi-model-lens --body true
# Replace vX.Y.Z with the approved release tag.
gh workflow run publish-npm.yml --repo malker97/pi-model-lens --ref vX.Y.Z -f dry_run=false
```

Review and approve the pending `npm` deployment in GitHub Actions. The final job rechecks the artifact
checksum, then publishes that exact tarball using OIDC, with provenance and lifecycle scripts disabled.
It verifies npm's SHA-512 integrity, retrying briefly for registry propagation. Reruns accept an identical
already-published version without publishing twice; different bytes or ambiguous lookup errors fail closed.
If the publication switch is disabled, the prepare job fails before requesting environment approval.

## Verify and Install After npm Publication

```sh
npm view pi-model-lens@0.0.1 version dist.integrity --registry=https://registry.npmjs.org/
pi install npm:pi-model-lens@0.0.1
```

Test installation in an isolated Pi agent directory first. On a machine already using a local or Git
source, remove that source before installing npm to prevent duplicate capture. Reload existing sessions.
The `pi-package` keyword makes the package eligible for discovery in the Pi package gallery; verify
actual indexing after publication rather than assuming immediate listing.

## References

- [Pi packages](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/packages.md)
- [npm public package publishing](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
