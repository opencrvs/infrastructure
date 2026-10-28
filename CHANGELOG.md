# Changelog

## 2.2.0 Release Candidate

### New features

- Container registry other than Docker Hub. The `DOCKERHUB_ACCOUNT`, `DOCKERHUB_REPO`, `DOCKER_USERNAME` and `DOCKER_TOKEN` secrets are renamed to `REGISTRY_ORGANISATION`, `REGISTRY_REPOSITORY`, `REGISTRY_USERNAME` and `REGISTRY_TOKEN`, the new variable `REGISTRY_HOST` (default `docker.io`) sets the registry, and the pull secret is now `registry-credentials`. The secrets migration workflow copies the secrets, and `dockerhub-credentials` is still created next to the new pull secret [#14209](https://github.com/opencrvs/opencrvs-core/issues/14209)

### Bug fixes

- `convert-backup.sh` no longer leaves decrypted backup data on the backup server (all plaintext is kept in a private temporary directory that is always removed on exit) and no longer passes the passphrase on the command line
- Backup rotation on the backup server no longer runs as root. The script is installed root-owned as `/usr/local/sbin/opencrvs-rotate-backups.sh`, the cron job runs as `backup`, and directory names are matched strictly and passed to `rm` NUL-delimited.

## 2.1.0 Release

### Improvements

- Added Ubuntu 26.04 support to OpenCRVS infrastructure [#13111](https://github.com/opencrvs/opencrvs-core/issues/13111)
- Upgraded Kubernetes to v1.36 [#13177](https://github.com/opencrvs/opencrvs-core/issues/13177)
- Upgraded Traefik helm chart to 41.0.2 [#13291](https://github.com/opencrvs/opencrvs-core/issues/13291)
- Retrieve ENCRYPTION_KEY from backup server [#10927](https://github.com/opencrvs/opencrvs-core/issues/10927)

### Bug fixes

- Make provision user and group ids not rely on hardcoded values [#13192](https://github.com/opencrvs/opencrvs-core/issues/13192)

## 2.0.2 Release

## 2.0.1 Release

### New features

- Migration script to convert backup files taken by OS cronjob into k8s compatible format [#13099](https://github.com/opencrvs/opencrvs-core/issues/13099)

### Bug fixes

- Always restart the Kubernetes self-hosted runner during deployment to ensure the latest runner image and configuration changes are applied. [#332](https://github.com/opencrvs/infrastructure/pull/332)
- Testing outbound HTTPS connectivity instead of ping [#338](https://github.com/opencrvs/infrastructure/pull/338)
- Run differencial backup as non-root user after pgbackrest upgrade [#360](https://github.com/opencrvs/infrastructure/pull/360) [#13370](https://github.com/opencrvs/opencrvs-core/pull/13370)