# Changelog

## 1.9.17 Release Candidate

### Improvements

- Sentry has been removed from OpenCRVS, so `sentry.io` no longer has to be reachable for `opencrvs-bootstrap.sh` to pass its connectivity check. If you allowlist outbound traffic, you can drop it. Environment setup no longer asks for a Sentry DSN. [#13460](https://github.com/opencrvs/opencrvs-core/issues/13460)

## 1.9.16 Release Candidate

## 1.9.15 Release Candidate

## 1.9.14 Release Candidate

### Fixes

- Improved internet connectivity checks by replacing ICMP ping with HTTPS endpoint validation and detailed diagnostics for restricted environments.