# OpenCRVS Environment Configurator Specification

Status: Draft for review

This document describes the intended behavior and structure of the OpenCRVS environment configurator. It is meant to guide future refactoring so the configurator stays schema-driven, easier to reason about, and flexible enough for different deployment styles.

## Goals

The configurator should help an operator prepare an OpenCRVS environment by collecting only the values needed for the selected deployment style.

The UI should be driven by configuration metadata as much as possible. Screens, sub-screens, fields, field visibility, required state, update restrictions, generated values, and output targets should be defined in `configuration-fields.ts` or closely related schema files.

Special workflow steps may remain custom where they are not simple configuration fields:

- GitHub connection
- Environment selection
- Users
- Review
- Finalize
- Post-finalization next steps

## Deployment Model

The configurator supports deployment behavior based on two related concepts:

- Configuration backend
  - Where environment variables, secrets, and automation metadata are stored.

- Deployment outputs
  - What files or deployment artifacts the configurator prepares.

Current configuration backend:

- `github`: GitHub is used as the backend for repository variables, environment variables, repository secrets, environment secrets, and workflow automation metadata.

Current deployment outputs:

- `ansible`: The configurator prepares Ansible inventory files for infrastructure provisioning.
- `helm`: The configurator always prepares Helm chart values for dependencies and OpenCRVS services.

The active backend and infrastructure output are derived from setup choices rather than manually selecting a named profile. Helm values are always generated.

## Setup Choices

The first setup screen should collect these choices:

- Enable GitHub integration
  - Type: checkbox
  - Default: enabled
  - Selects backend: `github`
  - When disabled, no GitHub variables, secrets, environments, or workflow files should be read or written.
  - When disabled, secret values should be generated into an external `values.secrets.yaml` file instead of being stored in GitHub.
  - The secret file should be mapped from schema bindings in `configuration-fields.ts`.
  - For coding simplicity, the configurator may always generate `values.secrets.yaml` when GitHub is disabled and allow the user to download it at the final step.

- Infrastructure type
  - Type: select
  - Options:
    - On-Premise
    - Managed / Existing Kubernetes cluster
  - Default: On-Premise
  - On-Premise enables deployment output: `ansible`
  - Managed / Existing Kubernetes cluster does not require `ansible`

Derived examples:

| Scenario | GitHub backend | Infrastructure | Behavior |
| --- | --- | --- | --- |
| Full stack | enabled | On-Premise | Prepare configuration files to deploy an on-premise Kubernetes cluster and OpenCRVS on empty servers, generate Helm values, and store environment variables and secrets in the GitHub backend. |
| No GitHub integration | disabled | On-Premise | Prepare Ansible inventory and Helm values without using GitHub as the variables and secrets backend. Secrets are generated into an external `values.secrets.yaml` file for download at the final step. TODO: this requires Helm chart support for providing admin credentials as Helm values/secrets for Elasticsearch, Postgres, and MinIO. |
| Managed infrastructure | enabled | Managed / Existing | Store Helm chart secrets and variables in the GitHub backend and generate Helm values only. No infrastructure provisioning is performed. |
| Helm only | disabled | Managed / Existing | Generate Helm values and an external `values.secrets.yaml` file, without GitHub backend updates and without infrastructure provisioning. TODO: this requires Helm chart support for providing admin credentials as Helm values/secrets for Elasticsearch, Postgres, and MinIO. |

Future scenario to keep in mind, but not support yet:

- GitHub / Ansible bootstrap helper without Helm output
  - GitHub backend enabled.
  - On-Premise infrastructure enabled.
  - Would require a future separate mode that skips Helm value generation.
  - This would prepare inventory files and a minimal set of GitHub secrets/variables for bootstrap automation only.

## Screens

The visible screens should be determined by the active backend, deployment outputs, and screen schema.

Special screens:

- Setup
- GitHub configuration
- Environment selection
- Users
- Review
- Finalize / next steps

Schema-driven configuration screens:

- Infrastructure
- Application
- Dependencies

Each schema-driven screen may contain sub-screens. Sub-screens should also be schema-defined.

Examples:

- Application / General
- Application / Advanced
- Dependencies / General
- Dependencies / Advanced

`Advanced` should not be a hard-coded top-level screen. It should be represented as schema-defined sub-screens under the relevant configuration domain.

## Field Schema

Each configurable value should be represented as a field definition.

Expected field properties:

- `id`
  - Stable field identifier used by local state and UI.

- `screen`
  - Screen where the field appears.

- `subScreen`
  - Optional sub-screen where the field appears.

- `section`
  - Optional visual group header.

- `order`
  - Optional number used to order fields within a section.
  - Fields with lower `order` values should appear first.
  - Fields without `order` should keep their schema declaration order after ordered fields.

- `label`
  - Human-friendly field label.

- `description`
  - Help text shown below the field.

- `control`
  - UI control type, such as text, password, checkbox, select, textarea.

- `options`
  - Select options, when applicable.

- `defaultValue`
  - Static or computed default value.

- `required`
  - Whether the field must have a value when active.

- `updatable`
  - Optional boolean. Defaults to `true`.
  - Controls whether the field can be changed after the environment already exists.
  - `updatable: false` means:
    - the field is editable while creating a new environment;
    - the field is shown as readonly when editing an existing environment.

- `generated`
  - Whether the field value is generated by the configurator.
  - `generated` only explains where the value comes from.
  - Editability for existing environments is controlled by `updatable`.

- `requires`
  - Backend or deployment outputs required for this field to be active.
  - Optional when `bindings` are defined, because active bindings can also prove that a field is relevant.
  - Useful for fields with no bindings, such as UI-only or state-only fields.
  - Examples:
    - `requires: ['github']` means the field is only needed when GitHub integration is enabled.
    - `requires: ['ansible']` means the field is only needed when inventory generation is enabled.
    - No `requires` value means the field can be considered for all setup choices, subject to `visibleWhen` and bindings.

- `visibleWhen`
  - Field-level visibility condition based on another field value.

- `source`
  - The single source of truth used to load the field's current value.
  - A field may write to multiple places through bindings, but it should have only one source of truth.
  - Examples:
    - `source: { target: 'github', scope: 'ENVIRONMENT', kind: 'secret', name: 'SMTP_PASSWORD' }` means the current value is loaded from a GitHub environment secret when GitHub integration is enabled.
    - `source: { target: 'state', name: 'elastalertNotificationType' }` means the current value is loaded from local configurator state.
    - `source: { target: 'derived', name: 'CONTENT_SECURITY_POLICY_WILDCARD' }` means the value is computed from another field, such as `DOMAIN`.

- `bindings`
  - Where the field is written during review/finalize.
  - A field may have multiple bindings.
  - Optional when `requires` is defined, because some fields are UI-only or state-only and are not written directly to an output.
  - Example:

```ts
{
  id: 'domain',
  source: { target: 'github', scope: 'ENVIRONMENT', kind: 'variable', name: 'DOMAIN' },
  bindings: [
    { target: 'github', scope: 'ENVIRONMENT', kind: 'variable', name: 'DOMAIN' },
    { target: 'helm', chart: 'opencrvs-services', path: 'hostname' },
    { target: 'helm', chart: 'dependencies', path: 'hostname' }
  ]
}
```

In this example GitHub is the source of truth when GitHub integration is enabled, but the same value is also written into Helm values.

## Field Activation

A field is active when:

- Its `visibleWhen` condition is satisfied.
- And either:
  - its `requires` backend and deployment outputs are satisfied by the current setup choices;
  - or at least one binding target is enabled.

Fields that are not active should not be shown, should not be required, and should not create review/finalize output.

`requires` and `bindings` are intentionally allowed to overlap, but they do not both need to be present:

- Bound output fields may omit `requires` when their bindings are enough to determine relevance.
- UI-only or state-only fields may use `requires` with `bindings: []`.
- A field with neither `requires` nor active bindings is considered globally relevant, subject to `visibleWhen`.

Field activation should be based on enabled bindings, not only on the field source.

Example:

```ts
{
  id: 'domain',
  source: { target: 'github', scope: 'ENVIRONMENT', kind: 'variable', name: 'DOMAIN' },
  bindings: [
    { target: 'github', scope: 'ENVIRONMENT', kind: 'variable', name: 'DOMAIN' },
    { target: 'helm', chart: 'opencrvs-services', path: 'hostname' }
  ]
}
```

If GitHub integration is disabled, the GitHub source and GitHub binding are unavailable. The field should still appear because the Helm binding is enabled and Helm values are always generated.

For `source: state`, the configurator state may be a dynamic key/value dictionary. State-only fields are allowed when their `requires` conditions are satisfied, even if they have no bindings.

## Bindings

Bindings describe where a field value is written.

Supported binding targets:

- `github`
  - Repository variable
  - Environment variable
  - Repository secret
  - Environment secret

- `helm`
  - Chart name
  - YAML path
  - Optional transform

- `ansible`
  - Inventory path
  - Optional transform

Bindings should only apply when their target backend or deployment output is enabled.

For example:

- A GitHub secret binding should be ignored when `github` is disabled.
- An Ansible inventory binding should be ignored when `ansible` is disabled.
- Helm values bindings are always active because Helm values are always generated.

When `github` is disabled, secret values that would normally be stored in GitHub should be generated into `values.secrets.yaml` when Helm charts need them. Datastore admin credentials are expected to be supported by Helm charts later; until that chart work is done, no-GitHub scenarios that require those datastore secrets are incomplete.

## Generated Values

Some values are generated automatically by the configurator.

Current generated values include:

- `ENCRYPTION_KEY`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MONGODB_ADMIN_USER`
- `MONGODB_ADMIN_PASSWORD`
- `ELASTICSEARCH_SUPERUSER_PASSWORD`
- `CONTENT_SECURITY_POLICY_WILDCARD`

Generated values should be stable once created. Reloading an existing environment should preserve existing values instead of replacing them.

Generated non-secret fields may still be visible under normal or advanced screens when useful.

Generated secret values should not be visible in the UI. The UI may show that a generated secret is present, but it should not display the secret value.

`CONTENT_SECURITY_POLICY_WILDCARD` is derived from `DOMAIN`:

```text
*.{DOMAIN}
```

## Existing Environment Behavior

When GitHub integration is enabled and an environment already exists on GitHub, GitHub values should be loaded and used as the current state.

When creating a new environment, active fields should be editable by default.

When editing an existing environment, fields with `updatable: false` should be shown as readonly.

Known special behavior:

- `Enable disk encryption` should use `updatable: false`.
- It should be set to `true` when `ENCRYPTION_KEY` exists.
- It should be set to `false` when `ENCRYPTION_KEY` does not exist.

- `Backup and restore`
  - It should be set to `Backup` when `BACKUP_HOST` exists.
  - It should be set to `Restore` when `RESTORE_ENVIRONMENT_NAME` exists.

Other existing-environment update restrictions should be defined with `updatable: false` as they are discovered.

## Review Screen

The Review screen should show the plan before changes are applied.

It should only show sections relevant to the enabled backend and deployment outputs.

Possible sections:

- Files to update
  - Inventory files when `ansible` is enabled.
  - Helm values files.
  - Workflow files when `github` is enabled.
  - External `values.secrets.yaml` when `github` is disabled and secret values are required by Helm.

- GitHub variables
  - Only when `github` is enabled.

- GitHub secrets
  - Only when `github` is enabled.

- Helm chart values
  - Always shown because Helm values are always generated.

Table display rules:

- Compact table spacing.
- Horizontal scrolling for wide tables.
- Scope labels should use short values:
  - `REPO`
  - `ENV`
- Status labels should use short values:
  - `New`
  - `Exists`

Review sections should be collapsible and may collapse automatically after finalization.

## Finalize Behavior

Finalize should apply only the active backend and deployment outputs.

The finalization result screen should include a `Restart configurator` button so the operator can start a new configuration flow without manually refreshing or reopening the tool.

When `github` is enabled:

- Update repository variables.
- Update environment variables.
- Update repository secrets.
- Update environment secrets.
- Create or update GitHub environment if needed.
- Store the GitHub token as repository secret `GH_TOKEN`.

When `ansible` is enabled:

- Generate or update inventory files.

For Helm values:

- Generate or update Helm chart values.
- Apply managed Helm chart overrides.

When `github` is disabled:

- Do not read or write GitHub variables.
- Do not read or write GitHub secrets.
- Do not read or write GitHub workflow files.
- Do not require GitHub login.
- Do not render GitHub review sections.
- Generate an external `values.secrets.yaml` file for required secret values.
- Allow the user to download the generated `values.secrets.yaml` file at the final step.
- Map secret values into `values.secrets.yaml` using `configuration-fields.ts` schema metadata.

When `ansible` is disabled:

- Do not require infrastructure inventory fields.
- Do not generate inventory files.

## Post-Finalization Next Steps

After finalization, the UI should show next-step commands based on the active backend, deployment outputs, and infrastructure state.

If the environment inventory file already exists, bootstrap commands should not be shown. Existing inventory means the environment is already past the initial bootstrap step.

For a single-node cluster:

- Show the command to run on `KUBE_API_HOST`.

For worker nodes or backup server:

- Show the provision public key information message only when worker nodes are defined or backup is configured.
- Show the command to bootstrap worker nodes and backup server using the public key from the master node.

Bootstrap commands should:

- Use compact monospace text.
- Include a Copy button.

Performed actions should be shown in a collapsible section.

## UI Principles

The configurator should avoid exposing implementation details where possible.

Preferred UI behavior:

- Only show questions relevant to the selected deployment style.
- Allow active fields to be edited for new environments; use `updatable: false` for fields that should not change after the environment exists.
- Keep advanced values available but visually separated.
- Use concise descriptions near fields.
- Use consistent table styling across Review sections.
- Prefer schema-driven rendering over custom per-screen rendering.

## Refactoring Direction

The current code should be refactored incrementally. A full rewrite is not recommended because the configurator already contains many important business rules.

Suggested module boundaries:

- `deployment-context.ts`
  - Derive the active backend and deployment outputs from setup choices.
  - Check whether screens, fields, and bindings are active.

- `configuration-schema.ts`
  - Field and screen definitions.
  - Schema validation.

- `configuration-state.ts`
  - Load and save current configuration values.
  - Merge defaults, existing GitHub values, generated values, and submitted values.

- `github-plan.ts`
  - Build GitHub variable and secret update plans.
  - Apply GitHub updates.

- `helm-plan.ts`
  - Build Helm update plans.
  - Write Helm overrides.
  - Preserve the existing `copyChartsValues` behavior, including its built-in logic and Handlebars template compilation.

- `ansible-plan.ts`
  - Build inventory update plans.
  - Write inventory files.
  - Preserve the existing `generateInventory` behavior, including its built-in logic and Handlebars template compilation.

- `review-plan.ts`
  - Combine backend-specific and output-specific plans into the Review response.

- `finalize.ts`
  - Apply the selected plan.

- `next-steps.ts`
  - Build post-finalization instructions.

- `ui-routes.ts`
  - HTTP endpoints and request/response wiring.

Frontend split:

- `navigation.js`
- `configuration-screens.js`
- `review.js`
- `finalize.js`
- `users.js`
- `api.js`

## Refactor Plan

The refactor should happen in small phases. Each phase should preserve current behavior and leave the configurator runnable.

### Phase 1: Deployment Context And Schema Activation

Goal: centralize the rules that decide whether screens, fields, and bindings are active.

Work:

- Add `deployment-context.ts`.
- Move backend/output derivation into this module.
- Add helpers for:
  - active backend checks;
  - active deployment output checks;
  - active binding checks;
  - field activation;
  - screen activation.
- Keep current behavior for GitHub, Ansible, and always-on Helm.
- Add focused tests for field activation:
  - field with GitHub and Helm bindings remains active when GitHub is disabled;
  - field with only GitHub bindings is inactive when GitHub is disabled;
  - field with `requires: ['github']` and `bindings: []` is active only when GitHub is enabled;
  - field with neither `requires` nor bindings is globally active, subject to `visibleWhen`.

### Phase 2: Configuration Schema Cleanup

Goal: make `configuration-fields.ts` easier to read and closer to this specification.

Work:

- Add optional `order` support.
- Move advanced fields into schema-defined sub-screens:
  - Application / General
  - Application / Advanced
  - Dependencies / General
  - Dependencies / Advanced
- Remove duplicated `requires` values from fields where bindings already express relevance.
- Keep `requires` on UI-only or state-only fields with `bindings: []`.
- Ensure every field has one clear source of truth.

### Phase 3: Configuration State

Goal: isolate loading, merging, defaulting, generated values, and submitted values.

Work:

- Add `configuration-state.ts`.
- Move generic field value loading into this module.
- Preserve generated value behavior.
- Ensure generated secrets are never returned to the UI as visible values.
- Keep existing GitHub environment loading behavior.
- Preserve special existing-environment behavior:
  - disk encryption from `ENCRYPTION_KEY`;
  - backup/restore from `BACKUP_HOST` and `RESTORE_ENVIRONMENT_NAME`.

### Phase 4: Planning Modules

Goal: separate "what will change" from HTTP routing and finalization.

Work:

- Add `github-plan.ts`.
- Add `helm-plan.ts`.
- Add `ansible-plan.ts`.
- Add `review-plan.ts`.
- Move GitHub variable/secret planning into `github-plan.ts`.
- Move Helm override planning into `helm-plan.ts`.
- Move inventory planning into `ansible-plan.ts`.
- Preserve existing `copyChartsValues` behavior and Handlebars template compilation.
- Preserve existing `generateInventory` behavior and Handlebars template compilation.
- Ensure Review only shows sections relevant to the active backend and outputs.

### Phase 5: Finalize And Next Steps

Goal: make finalization a small orchestration layer over already-built plans.

Work:

- Add `finalize.ts`.
- Add `next-steps.ts`.
- Apply GitHub, Helm, and Ansible plans through separate functions.
- Generate external `values.secrets.yaml` when GitHub is disabled and Helm needs secret values.
- Add final-step download support for `values.secrets.yaml`.
- Hide bootstrap commands when an environment inventory file already exists.
- Add `Restart configurator` button behavior.

### Phase 6: HTTP Routes

Goal: make `ui-server.ts` mostly request/response wiring.

Work:

- Add `ui-routes.ts` or route-specific modules.
- Move route handlers out of `ui-server.ts`.
- Keep shared response helpers small.
- Keep special workflow routes explicit:
  - GitHub login;
  - environment selection;
  - users;
  - review;
  - finalize.

### Phase 7: Frontend Split

Goal: reduce `ui/application.js` into smaller modules without changing the rendered UI.

Work:

- Add `api.js` for fetch helpers.
- Add `navigation.js` for screen transitions.
- Add `configuration-screens.js` for schema-driven screen rendering and draft state.
- Add `users.js` for user management UI.
- Add `review.js` for review tables and collapsible sections.
- Add `finalize.js` for next steps, copy buttons, downloads, and restart behavior.

### Phase 8: Cleanup And Regression Tests

Goal: remove old duplicated helpers after behavior is covered by tests.

Work:

- Remove obsolete functions from `ui-server.ts`.
- Add tests for:
  - deployment context;
  - field activation;
  - generated values;
  - GitHub-disabled behavior;
  - Review output sections;
  - next-step command visibility.
- Run TypeScript checks after each phase.

## Decisions

- Advanced configuration is schema-defined through sub-screens, not a hard-coded top-level screen.
- Generated secret values should not be displayed. The UI may only show that they are present.
- `source: state` is valid for state-only fields. A separate `consumedBy` property is not needed for now.
- Setup choices should not be persisted in the repository.
- The configurator should focus on GitHub only. It should not support third-party Git backends directly.
