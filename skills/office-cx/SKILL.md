---
name: office-cx
description: Start Onecarat Agent Office CX for the calling Codex session when the user asks to open the Codex office or watch this session in its own window.
---

Start the read-only Office viewer for this calling session. The application does not send prompts, approvals, or control commands to Codex.

Run only the manually installed protected copy, preserving the calling thread identifier:

```powershell
& "$env:LOCALAPPDATA/Programs/OnecaratCX/runtime/node.exe" "$env:LOCALAPPDATA/Programs/OnecaratCX/scripts/launch-office.mjs"
```

The launcher reads `CODEX_THREAD_ID` and verifies it against the matching rollout's `session_meta.id`. Do not substitute `CODEX_SESSION_ID`: child threads may share that value with the parent. Never pick the newest log or use a remembered thread ID to guess the calling session. Do not create another Codex task to launch the viewer.

If binding fails, report the short launcher diagnostic. An explicit `--thread` value is appropriate only when the user has identified that target thread. Do not edit Codex settings or authentication to make launch work. If the installed copy is missing or inaccessible, do not fall back to the repository launcher, use --development, install automatically, or change ACLs. Refer to docs/SECURITY_RESPONSE_2026_11_22.md for manual installation and normal-PowerShell launch. Protected ACLs can intentionally prevent sandbox access. Closing Office does not stop Codex.

Repeated launch reuses the same thread's window. Each separately invoked thread gets its own window. No global skill installation is required for the project AGENTS.md natural-language route; this folder is not claimed to be automatically discovered as a slash command.
