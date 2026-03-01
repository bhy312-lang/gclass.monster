# Multi-Agent Runner (Isolated)

This folder is intentionally isolated from the existing app/runtime.
It does not modify any existing project code unless you explicitly run it with `--write`.

## What it does

- Planner agent: analyzes request and creates a plan.
- Coder agent: generates file outputs based on that plan.
- Optional apply: writes generated files only when `--write` is passed.

## Requirements

- Node.js 18+ (for built-in `fetch`)
- API key:
  - `MA_API_KEY`, or
  - `OPENAI_API_KEY`

Optional environment variables:

- `MA_BASE_URL` (default: `https://api.openai.com/v1`)
- `MA_PLANNER_MODEL` (default: `gpt-5-mini`)
- `MA_CODER_MODEL` (default: `gpt-5-mini`)
- `MA_MAX_CONTEXT_CHARS` (default: `16000`)

## Usage

Dry run (no files written):

```bash
node tools/multi-agent/orchestrator.cjs --context refer/terms_of_service.txt "회원 가입 동의 플로우 코드 생성"
```

Apply generated files:

```bash
node tools/multi-agent/orchestrator.cjs --write --out-dir tools/multi-agent/output "샘플 Express API 생성"
```

PowerShell wrapper:

```powershell
.\tools\multi-agent\run-multi-agent.ps1 -Request "회원 약관 체크박스 포함 폼 생성" -Context "refer/terms_of_service.txt,refer/privacy_policy.txt"
.\tools\multi-agent\run-multi-agent.ps1 -Request "샘플 API 생성" -Write -OutDir "tools/multi-agent/output"
```

## Safety

- No existing files are touched unless:
  - you pass `--write`, and
  - generated paths resolve inside `--out-dir` (path traversal blocked).
