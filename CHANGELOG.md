# Changelog

## 1.9.17 Release Candidate

### Improvements

- Sentry has been removed from OpenCRVS core, so environment setup no longer prompts for a Sentry DSN and `SENTRY_DSN` is no longer provisioned. An existing secret is left in place but ignored, and can be deleted. `sentry.io` is also gone from the bootstrap connectivity check, so it is no longer a required outbound endpoint. [#13460](https://github.com/opencrvs/opencrvs-core/issues/13460)

## 1.9.16 Release Candidate

## 1.9.15 Release Candidate

## 1.9.14 Release Candidate

### Fixes

- Improved internet connectivity checks by replacing ICMP ping with HTTPS endpoint validation and detailed diagnostics for restricted environments.