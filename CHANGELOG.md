# Changelog

## 1.9.15 Release Candidate

## 1.9.14 Release Candidate

### Fixes

- Improved internet connectivity checks by replacing ICMP ping with HTTPS endpoint validation and detailed diagnostics for restricted environments.
## 2.0.1 Release

### Bug fixes

- Always restart the Kubernetes self-hosted runner during deployment to ensure the latest runner image and configuration changes are applied. [#332](https://github.com/opencrvs/infrastructure/pull/332)
- Testing outbound HTTPS connectivity instead of ping [#338](https://github.com/opencrvs/infrastructure/pull/338)
