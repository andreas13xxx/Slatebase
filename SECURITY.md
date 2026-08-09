# Security Policy

## Supported Versions

Slatebase is pre-1.0 software under active development. Only the latest released version is supported with security fixes.

| Version | Supported |
|---------|-----------|
| Latest  | ✅ |
| Older   | ❌ |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, use GitHub's [private vulnerability reporting](https://github.com/andreas13xxx/Slatebase/security/advisories/new) for this repository (Security tab → "Report a vulnerability"). This opens a private draft advisory visible only to the maintainer until a fix is available.

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce (or a proof of concept)
- Affected version/commit

## Response

This is a solo-maintained open source project. There's no guaranteed response time, but reports are taken seriously and addressed as soon as possible. You'll get an acknowledgement once the report is reviewed.

## Scope

Slatebase is self-hosted software — you run and administer your own instance. Vulnerabilities in the application itself (authentication, authorization, plugin sandboxing, path traversal, XSS, etc.) are in scope. Issues arising purely from misconfiguration of your own deployment (e.g., exposing the backend directly without a reverse proxy) are not.
