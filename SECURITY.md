# Security Policy

## Supported Versions

Only the latest `0.1.x` release of `pathport` is currently supported with security updates.

## Security Model

PathPort is designed as a **read-only, local-first** static path scanner:

- It inspects filesystem metadata (`lstat`, `readdir`, `readlink`, `realpath`) and does **not** read file contents.
- It does **not** execute scripts, hooks, or child processes in scanned repositories.
- It does **not** follow symlinks outside the scan root or recurse into symlinked directories.
- It makes **zero** network requests.

## Reporting a Vulnerability

If you discover a security issue (for example, a symlink traversal bypass, ReDoS in path matching, or unintended file access), please **do not** open a public issue with exploit details.

Instead, report it privately via GitHub Security Advisories on the repository ("Report a vulnerability") or contact the maintainer directly. Please include:

- A clear description of the vulnerability and potential impact
- Steps to reproduce or a minimal proof-of-concept
- Affected Node.js version and OS

We aim to acknowledge reports within 72 hours and provide a fix or mitigation plan promptly.
