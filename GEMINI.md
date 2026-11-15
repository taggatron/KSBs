# Workspace Privacy & UK GDPR Zero-PII Safeguards

## AI Agent & Model Air-Gap Directives (All Models Including Gemini Carbon)

All AI coding agents, subagents, CLI tools, and automated workflows operating in this repository MUST strictly comply with the following UK GDPR and data-protection boundaries:

1. **Zero PII in AI Model Context**:
   - **NEVER** submit, read, print, or expose Personally Identifiable Information (PII) into AI model context. This includes learner/student names, staff personal records, student IDs (`PersonCode`, `ULN`, candidate numbers), dates of birth, safeguarding logs, SEND/EHCP records, medical conditions, pastoral narratives, or assessment scripts containing real learner names.
   - **NEVER** use file-reading or search tools (`read_file`, `view_file`, `grep_search`) or shell dump commands (`cat`, `head`, `tail`, `printenv`, `docProps/core.xml` author dumps) on raw learner data files, `.env` secrets, SQLite databases, or browser profiles (`puppeteer_profile`).

2. **Silent Local Data Processing**:
   - All scripts processing institutional, curriculum, attendance, assessment, or SharePoint data MUST strip personal names (`Author`, `Personal tutor`, `Teaching team`, `StudentName`, `PersonCode`) in memory and output **anonymised progress counters and aggregate metrics only** to `stdout`/`stderr`.

3. **Redacted Visual Captures (Screenshots)**:
   - Never capture unredacted screenshots of live MIS/EBS portals or student dashboards. Privacy redaction shields (`body.privacy-active`) must remain active during any visual capture.

4. **Enterprise BAA Boundary Only**:
   - Unmasked institutional data may only be processed locally on-device or transmitted strictly via institutional BAA-covered endpoints (e.g., UK South enterprise Azure OpenAI), completely bypassing IDE AI model context.

5. **Git & GitHub Exclusion Enforcement**:
   - Raw data extracts, `.env` credentials, and browser profiles must remain excluded via `.geminiignore` and `.gitignore` and must never be committed or pushed to GitHub.
