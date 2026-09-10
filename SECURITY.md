# Security Policy

## Reporting a Vulnerability

Do not report security vulnerabilities through public GitHub issues, discussions,
or pull requests.

If you believe you have found a security vulnerability in this project, please
report it to the Adobe Product Security Incident Response Team (PSIRT) at
[PSIRT@adobe.com](mailto:PSIRT@adobe.com). Where possible, please encrypt your
message using our [PGP key](https://www.adobe.com/security/pgp-key.html).

Please include as much of the following information as you can to help us
understand and resolve the issue quickly:

- The type of issue and which component it affects
- Steps to reproduce, including a sample workload export or SQL input if relevant
- The version or commit of `workload-analyzer` you were running
- The operating system and architecture
- Any proof-of-concept or exploit code

You should receive a response within 72 hours. If for some reason you do not,
please follow up to ensure we received your original message.

See the [Adobe Security](https://www.adobe.com/security.html) page for more
information about how Adobe handles security.

## Scope

`workload-analyzer` is an offline, single-binary tool that loads a CockroachDB
workload-exporter ZIP into an in-memory DuckDB and serves a local, read-only web
UI bound to localhost. It does not connect to any database or send data off the
machine. Issues of particular interest include ZIP/CSV parsing safety, path
traversal during extraction, and any way the local HTTP surface could read or
write outside the loaded export.
