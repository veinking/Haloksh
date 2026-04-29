# Development Guardrails

This document captures the user-provided engineering constraints that must guide all future patches.

## 1) Functionality First
- Do not break existing pipelines.
- Existing tests must pass before merge.
- New modules must include minimal tests.
- Validate before acceptance:
  - Startup works
  - Scanner works
  - Strategy engine works
  - Execution path works
  - Logging works
  - CLI works

## 2) Preserve Core Pipeline
- Keep architecture intact unless explicitly approved.
- Required order: `scan -> signal -> risk -> execute -> log -> analytics`.
- AI, analytics, or tools can extend this pipeline, not replace it.

## 3) Modular Architecture
- Keep concerns in dedicated modules (scanner, strategy, execution, wallet, risk, ai, analytics, cli).
- Avoid oversized modules (target under ~500 lines unless justified).

## 4) API-First Wrapping
- Completed components should expose reusable API methods.
- Recommended API layout:
  - `api/scanner_api.py`
  - `api/strategy_api.py`
  - `api/wallet_api.py`
  - `api/analytics_api.py`
- Example API operations:
  - `scan_tokens()`
  - `generate_signals()`
  - `execute_trade()`
  - `get_portfolio()`

## 5) Separation of Concerns
- Do not mix data logic, trading logic, execution logic, and UI logic.
- Ownership:
  - scanner finds tokens
  - strategy decides entries
  - risk decides sizing/limits
  - execution submits trades

## 6) Config-Driven Behavior
- Do not hardcode strategy/trading parameters.
- Store behavior settings in config (for example `config.yaml`).

## 7) CLI Consistency
- CLI flows should support: `back`, `skip`, `exit`.
- Menu convention:
  - `1 ...`
  - `2 ...`
  - `3 ...`
  - `9 Back`
  - `0 Exit`
- Keep CLI modules under `cli/`.

## 8) Structured Logging
- Log scanner results, trade entries/exits, errors, and AI adjustments.
- Format: `timestamp | module | event | details`.
- Persist runtime logs to `logs/runtime.log`.

## 9) Database Safety
- Persistent writes must go through data-layer APIs.
- Avoid ad-hoc SQL in business logic.

## 10) Strategy Isolation
- Keep strategies in `strategies/` and implement `generate_signal(token_data)`.

## 11) Risk Gate Always Required
- No execution without risk validation.
- Required sequence: `signal -> risk_validation -> execution`.

## 12) Backtesting Support
- Strategies should support `simulate(trade_data)`.

## 13) Optional AI
- AI components must be toggleable (for example `AI_ENABLED`).

## 14) Safe Parameter Adjustment
- Bound AI-driven parameter changes with per-cycle maximum deltas.

## 15) Safe Defaults
- Default mode should be paper/dry-run unless explicitly overridden.

## 16) Dependency Pinning
- Pin dependency versions in lockfiles / requirements files.

## 17) Test Coverage Baseline
- Add at least basic tests for each major module.

## 18) Patch Discipline
- Prefer additive patches.
- Avoid deleting working code unless fixing a clear bug.
- Do not rename core modules or break CLI/data schemas.

## 19) Code Quality
- Require type hints, docstrings, descriptive names, and lines under 120 chars.

## 20) Scalability
- Design for multi-chain, multi-wallet, multi-strategy, multi-user, API and dashboard extensions.

## Suggested Structure (When Applicable)
```
bot/
  scanner/
  strategies/
  execution/
  risk/
  wallet/
  ai/
  analytics/
  api/
  cli/

data/
logs/
tests/
config/
```

> Note: This repository currently has a different domain and layout; these guardrails are retained as policy
> guidance for future bot-oriented work and architecture decisions.
