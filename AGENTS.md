# AGENTS.md — OpenCRVS Infrastructure

Guidance for AI coding agents working in this infrastructure repository.

This repo provisions and configures OpenCRVS servers (Ansible, Kubernetes, Helm,
Terraform). It handles production infrastructure and secrets.

Docs: https://github.com/opencrvs/documentation

## Security rules — non-negotiable

- **ALWAYS obey `.claude/settings.json` permissions.** Deny rules exist to keep
  production credentials and server details out of the model context.
- **NEVER work around the deny rules or the hooks.** Do not `cat`, `grep`, `sed`,
  `head`/`tail`, or otherwise shell out to read a file that `Read` is denied.
- **NEVER read or exfiltrate server IP addresses, inventory files, `known_hosts`,
  SSH/VPN keys, or any PII or production secrets.** A `PreToolUse` hook blocks
  reading files that contain IP addresses; treat a block as final.
- Do not run `sudo`, `ssh`, `scp`, `kubectl`, `git push`, or `docker push`
  yourself — ask the human to run privileged/remote commands.

If you need a value that lives in a denied file, ask the human for it instead of
reading the file.
