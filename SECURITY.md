<!--
    SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>

    SPDX-License-Identifier: Apache-2.0
-->

# Security Policy

Metis is an open-source command-line tool intended for use by the developer and security community. We make no guarantees about the security of intermediate commits or pre-release code. Security-related validation is primarily performed at the time of tagged releases.


## Reporting a Vulnerability

Security vulnerabilities may be reported to the Arm Product Security Incident Response Team (PSIRT) by sending an email
to [psirt@arm.com](mailto:psirt@arm.com).

For more information visit https://developer.arm.com/support/arm-security-updates/report-security-vulnerabilities

## Security Guidelines

Metis is a CLI tool and does not operate as a networked service. However, users and contributors should still follow standard software security practices, such as:

- Validating input and output when integrating Metis into larger pipelines.
- Reviewing third-party dependencies regularly for vulnerabilities.
- Ensuring that local environments (e.g., Python runtime, system packages) are up to date and secured.
- Not exposing logs or intermediate results that may contain sensitive project data.
