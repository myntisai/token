# Contributing

## Development Setup

1. `npm ci`
2. `cp .env.example .env`
3. `npx hardhat compile`
4. `npx hardhat test`

## Branch and Commit Guidelines

- Use a feature branch for changes.
- Keep PRs focused and small when possible.
- Use clear commit messages (e.g. `fix(staking): prevent double counting`).

## Pull Request Checklist

- [ ] Contracts compile with no errors.
- [ ] Relevant tests added/updated.
- [ ] No real secrets included in code, scripts, or docs.
- [ ] Deployment/migration script changes include usage notes.
- [ ] Security-sensitive changes include reasoning in PR description.

## Contract Changes

- Prefer explicit, minimal state transitions.
- Add tests for failure modes and access control.
- Document upgrade impacts for proxy-based contracts.

## Reporting Issues

- Use GitHub Issues for bugs and feature requests.
- For security issues, follow `SECURITY.md` and do not open a public issue.
