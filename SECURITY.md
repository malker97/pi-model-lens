# Security Policy

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/malker97/pi-model-lens/security/advisories/new)
for security issues. Do not post credentials, raw provider traffic, or private conversations in a public
issue. Ordinary bugs can be reported with redacted or synthetic examples.

The latest released 0.0.x version is the supported security target. Pi host compatibility is currently
tested with 1.5.0; see the release notes before upgrading the host.

## Trust Boundaries

Pi extensions run with the user's permissions. Review the source before installing. Model Lens observes
an existing provider in-process; it does not need a proxy certificate or its own API key.

- Capture only the allowlisted model fields, response ID, completion time, and status.
- Never save prompts, answers, reasoning, tool arguments, cookies, authorization headers, or credentials
  in the added routing records.
- Validate persisted metadata before rendering it, including model-identifier length and control characters.
- Treat missing, incomplete, and conflicting information as inconclusive, not a confirmed match.
- Keep custom records out of model context. Do not change authentication, transport, usage, or assistant content.

Records remain in local Pi session files. Exporting or sharing those files may also share routing
metadata. Model identifiers are declarations by the server, not proof of model weights.

## Release Security

CI runs with read-only repository permissions and no model credentials. GitHub release creation has
write permission only in its separate asset-publication job, after tag, version, ancestry, and test checks.
Release artifacts have SHA-256 checksums and are never silently replaced on a rerun.

Npm publishing is a separate manual workflow. It defaults to validation-only, requires the
`NPM_PUBLISH_ENABLED` repository switch, and uses the protected `npm` environment for actual publication.
Only the publishing job receives OIDC permission. Configure npm Trusted Publishing instead of storing
long-lived npm tokens in this repository or its Actions secrets. See [the release guide](docs/RELEASING.md).

If a release or credential is suspected to be compromised, stop pending publication runs, disable the
publication switch, remove the affected trusted-publisher configuration or revoke credentials as
appropriate, and coordinate a new fixed version. Do not retag or overwrite an already released version.
