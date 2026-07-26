let existingSecretSentinel = '';
const { getJson, postJson } = window.OpenCRVSApi;
const { showScreen: renderScreen } = window.OpenCRVSNavigation;
const { buildConfigurationUi } = window.OpenCRVSConfigurationScreens;
const { parseUserKeys, validateUserInput: validateUserDraft } = window.OpenCRVSUsers;
const { renderReview: renderReviewTable } = window.OpenCRVSReview;
const { renderFinalizeSummary: renderFinalizeSummaryContent } = window.OpenCRVSFinalize;
const { renderForm: renderConfigurationForm } = window.OpenCRVSFormRenderer;
const configurationSchema = (window.OpenCRVSConfigurationSchema || [])
  .slice()
  .sort((left, right) => left.order - right.order);

buildConfigurationUi(configurationSchema);
const setupForm = document.querySelector('#setup-form');
const setupButton = document.querySelector('#setup-button');
const setupStatusBox = document.querySelector('#setup-status');
const enableGithubIntegrationInput = document.querySelector('#enableGithubIntegration');
const infrastructureTypeInput = document.querySelector('#infrastructureType');
const form = document.querySelector('#github-form');
const environmentForm = document.querySelector('#environment-form');
const organisationInput = document.querySelector('#organisation');
const repositoryInput = document.querySelector('#repository');
const tokenInput = document.querySelector('#token');
const button = document.querySelector('#connect-button');
const environmentButton = document.querySelector('#environment-button');
const finalizeButton = document.querySelector('#finalize-button');
const statusBox = document.querySelector('#status');
const environmentStatusBox = document.querySelector('#environment-status');
const reviewStatusBox = document.querySelector('#review-status');
const steps = Array.from(document.querySelectorAll('.step'));
const configurationNavigation = Array.from(document.querySelectorAll('.configuration-navigation'));
const githubNavigation = document.querySelector('#github-navigation');
const reviewNavigation = document.querySelector('#review-navigation');
const authenticationPart = document.querySelector('#authentication-part');
const environmentPart = document.querySelector('#environment-part');
const connectionSummary = document.querySelector('#connection-summary');
const githubScreenTitle = document.querySelector('#github-screen-title');
const githubScreenDescription = document.querySelector('#github-screen-description');
const environmentDescription = document.querySelector('#environment-description');
const environmentNameInput = document.querySelector('#environmentName');
const customEnvironmentField = document.querySelector('#customEnvironmentField');
const customEnvironmentNameInput = document.querySelector('#customEnvironmentName');
const environmentTypeInput = document.querySelector('#environmentType');
const approvalRequiredInput = document.querySelector('#approvalRequired');
const githubApproversInput = document.querySelector('#githubApprovers');
const usersTableBody = document.querySelector('#usersTableBody');
const addUserButton = document.querySelector('#add-user-button');
const addCurrentUserButton = document.querySelector('#add-current-user-button');
const userEditor = document.querySelector('#user-editor');
const userNameInput = document.querySelector('#userName');
const userRoleInput = document.querySelector('#userRole');
const userPresentInput = document.querySelector('#userPresent');
const userKeysInput = document.querySelector('#userKeys');
const saveUserButton = document.querySelector('#save-user-button');
const cancelUserButton = document.querySelector('#cancel-user-button');
const reviewFiles = document.querySelector('#reviewFiles');
const reviewVariables = document.querySelector('#reviewVariables');
const reviewSecrets = document.querySelector('#reviewSecrets');
const reviewHelmValues = document.querySelector('#reviewHelmValues');
const finalizeSummary = document.querySelector('#finalize-summary');
const finalizeProgress = document.querySelector('#finalize-progress');
const finalizeProgressLabel = document.querySelector('#finalize-progress-label');
const finalizeProgressPercent = document.querySelector('#finalize-progress-percent');
const finalizeProgressBar = document.querySelector('#finalize-progress-bar');
const finalizeProgressSteps = document.querySelector('#finalize-progress-steps');
let users = [];
let editingUserIndex = null;
let environmentPreviewRequest = 0;
let finalizeProgressTimer = null;
let deploymentFeatures = ['github', 'ansible', 'helm'];
let enabledConfigurationScreens = new Set(configurationSchema.map(({ id }) => id));
const configurationControllers = new Map(
  configurationSchema.map((definition) => [
    definition.id,
    {
      definition,
      form: document.querySelector('#' + definition.id + '-form'),
      fieldsContainer: document.querySelector('#' + definition.id + '-fields'),
      submitButton: document.querySelector('#' + definition.id + '-button'),
      status: document.querySelector('#' + definition.id + '-status'),
      customSubScreenComponents: Array.from(
        document.querySelectorAll(
          '#' + definition.id + '-form [data-custom-sub-screen]'
        )
      ),
      tabs: Array.from(
        document.querySelectorAll(
          '#' + definition.id + '-screen [data-sub-screen]'
        )
      ),
      fields: [],
      values: {},
      existingSecrets: {},
      context: {},
      renderer: null,
      selectedSubScreen: definition.subScreens?.slice()
        .sort((left, right) => left.order - right.order)[0]?.id || null
    }
  ])
);

function showStatus(type, message) {
  statusBox.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  statusBox.textContent = message;
}

function showSetupStatus(type, message) {
  setupStatusBox.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  setupStatusBox.textContent = message;
}

function showConfigurationStatus(screenId, type, message) {
  const status = configurationControllers.get(screenId)?.status;
  if (!status) {
    return;
  }
  status.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  status.textContent = message;
}

function hasDeploymentFeature(feature) {
  return deploymentFeatures.includes(feature);
}

function syncBackupWithoutAnsibleWarning(controller) {
  if (controller.definition.id !== 'dependencies') {
    return;
  }

  const warningId = 'dependencies-backup-without-ansible-warning';
  let warning = controller.fieldsContainer.querySelector('#' + warningId);

  if (!warning) {
    const anchor = controller.fieldsContainer.querySelector(
      '[data-config-field-container="backupRestoreMode"]'
    );
    if (!anchor) {
      return;
    }

    warning = document.createElement('div');
    warning.id = warningId;
    warning.className = 'alert alert-warning small mt-2 mb-3';
    warning.innerHTML = [
      '<p class="mb-2">Infrastructure configuration was skipped:</p>',
      '<ol class="mb-0">',
      '<li>Create ssh private/public key-pair.</li>',
      '<li>Add private key to GitHub secrets as <code>BACKUP_HOST_PRIVATE_KEY</code>.</li>',
      '<li>Add public key to <code>~/.ssh/authorized_keys</code> on Backup server for <code>BACKUP_SERVER_USER</code>.</li>',
      '</ol>'
    ].join('');
    anchor.insertAdjacentElement('afterend', warning);
  }

  warning.classList.toggle(
    'd-none',
    hasDeploymentFeature('ansible') || controller.values.backupRestoreMode !== 'backup'
  );
}

function syncGitHubVisibility() {
  githubNavigation.textContent = hasDeploymentFeature('github')
    ? 'GitHub configuration'
    : 'Environment';
  githubScreenTitle.textContent = hasDeploymentFeature('github')
    ? 'GitHub configuration'
    : 'Environment';
  githubScreenDescription.textContent = hasDeploymentFeature('github')
    ? 'Connect the infrastructure repository, then choose the environment to configure.'
    : 'Choose the environment to configure.';
  environmentDescription.textContent = hasDeploymentFeature('github')
    ? 'Choose the target GitHub environment and configure the repository approval settings used by deployment workflows.'
    : 'Choose the target environment name and type for generated local files.';
  authenticationPart.classList.toggle('d-none', !hasDeploymentFeature('github') || Boolean(environmentPart.dataset.githubConnected));
  approvalRequiredInput.closest('label').classList.toggle('d-none', !hasDeploymentFeature('github'));
  githubApproversInput.closest('label').classList.toggle('d-none', !hasDeploymentFeature('github'));
}

function syncConfigurationAvailability(states) {
  enabledConfigurationScreens = new Set(
    (states || []).map((state) => state?.definition?.id).filter(Boolean)
  );

  for (const navigationButton of configurationNavigation) {
    const enabled = enabledConfigurationScreens.has(navigationButton.dataset.screen);
    navigationButton.closest('li').classList.toggle('d-none', !enabled);
    navigationButton.disabled = !enabled || navigationButton.disabled;
  }

  for (const [screenId] of configurationControllers) {
    const screen = document.querySelector('#' + screenId + '-screen');
    screen?.classList.toggle('d-none', !enabledConfigurationScreens.has(screenId));
  }
}

function showReviewStatus(type, message) {
  reviewStatusBox.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  reviewStatusBox.textContent = message;
}

function getFinalizeProgressSteps() {
  return [
    { label: 'Environment', detail: 'Preparing environment configuration.' },
    ...(hasDeploymentFeature('ansible')
      ? [{ label: 'Infrastructure', detail: 'Generating inventory files.' }]
      : []),
    ...(hasDeploymentFeature('helm')
      ? [{ label: 'Helm values', detail: 'Writing generated chart values.' }]
      : []),
    ...(hasDeploymentFeature('github')
      ? [{ label: 'GitHub', detail: 'Updating variables, secrets, workflows, and environment.' }]
      : []),
    { label: 'Finalize', detail: 'Building next steps summary.' }
  ];
}

function renderFinalizeProgress(steps, activeIndex, percent) {
  finalizeProgress.classList.remove('d-none');
  finalizeProgressLabel.textContent = steps[activeIndex]?.detail || 'Finalizing setup...';
  finalizeProgressPercent.textContent = Math.round(percent) + '%';
  finalizeProgressBar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  finalizeProgressSteps.innerHTML = '';

  steps.forEach((step, index) => {
    const item = document.createElement('li');
    item.textContent = step.label;
    item.classList.toggle('done', index < activeIndex);
    item.classList.toggle('active', index === activeIndex);
    finalizeProgressSteps.appendChild(item);
  });
}

function startFinalizeProgress() {
  const steps = getFinalizeProgressSteps();
  let tick = 0;

  window.clearInterval(finalizeProgressTimer);
  finalizeProgress.classList.remove('finalize-progress-complete');
  finalizeProgressBar.classList.add('progress-bar-animated');
  renderFinalizeProgress(steps, 0, 5);

  finalizeProgressTimer = window.setInterval(() => {
    tick += 1;
    const maxBeforeDone = 92;
    const percent = Math.min(maxBeforeDone, 5 + tick * 6);
    const activeIndex = Math.min(
      steps.length - 1,
      Math.floor((percent / 100) * steps.length)
    );
    renderFinalizeProgress(steps, activeIndex, percent);
  }, 700);
}

function finishFinalizeProgress(success) {
  window.clearInterval(finalizeProgressTimer);
  finalizeProgressTimer = null;

  if (!success) {
    finalizeProgress.classList.add('d-none');
    return;
  }

  const steps = getFinalizeProgressSteps();
  renderFinalizeProgress(steps, steps.length - 1, 100);
  finalizeProgressLabel.textContent = 'Finalization complete.';
  finalizeProgressBar.classList.remove('progress-bar-animated');
  finalizeProgress.classList.add('finalize-progress-complete');
}

function showEnvironmentStatus(type, message) {
  environmentStatusBox.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  environmentStatusBox.textContent = message;
}

function showScreen(screenName) {
  renderScreen(screenName, {
    steps,
    configurationNavigation,
    reviewNavigation
  });
}

function enableConfigurationNavigation() {
  for (const navigationButton of configurationNavigation) {
    navigationButton.disabled = !enabledConfigurationScreens.has(navigationButton.dataset.screen);
  }
}

function enableReviewNavigation() {
  reviewNavigation.disabled = false;
}

function getNextAvailableScreen(screenId) {
  const currentIndex = configurationSchema.findIndex(({ id }) => id === screenId);
  const nextScreen = configurationSchema
    .slice(currentIndex + 1)
    .find(({ id }) => enabledConfigurationScreens.has(id));

  return nextScreen?.id || 'review';
}

function setConfigurationDirty(screenName, dirty) {
  const indicator = document.querySelector('#' + screenName + '-dirty');
  indicator?.classList.toggle('d-none', !dirty);
}

function completeGitHubLogin(result) {
  populateEnvironmentScreen(result);
  connectionSummary.textContent = 'Connected to ' + result.organisation + '/' + result.repository + '.';
  environmentPart.dataset.githubConnected = 'true';
  authenticationPart.classList.add('d-none');
  environmentPart.classList.remove('d-none');
  githubNavigation.disabled = false;
  syncGitHubVisibility();
}

function openEnvironmentStep(result = {}) {
  populateEnvironmentScreen(result);
  connectionSummary.textContent = hasDeploymentFeature('github')
    ? 'GitHub connection is ready.'
    : 'GitHub integration is disabled for this setup.';
  environmentPart.dataset.githubConnected = hasDeploymentFeature('github') ? 'true' : 'false';
  authenticationPart.classList.toggle('d-none', !hasDeploymentFeature('github'));
  environmentPart.classList.remove('d-none');
  githubNavigation.disabled = false;
  syncGitHubVisibility();
}

function renderUsers() {
  usersTableBody.innerHTML = '';

  if (users.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5">No users configured.</td>';
    usersTableBody.appendChild(row);
    return;
  }

  users.forEach((user, index) => {
    const row = document.createElement('tr');
    row.innerHTML = [
      '<td>' + user.name + '</td>',
      '<td>' + user.role + '</td>',
      '<td>' + (user.state === 'present' ? 'Present' : 'Absent') + '</td>',
      '<td>' + (user.ssh_keys || []).length + '</td>',
      '<td><div class="row-actions">' +
        '<button class="btn btn-outline-secondary btn-sm" type="button" data-action="edit" data-index="' + index + '">Edit</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-action="remove" data-index="' + index + '">Remove</button>' +
      '</div></td>'
    ].join('');
    usersTableBody.appendChild(row);
  });
}

function openUserEditor(user, index) {
  editingUserIndex = index;
  userNameInput.value = user?.name || '';
  userNameInput.disabled = index !== null;
  userRoleInput.value = user?.role || 'operator';
  userPresentInput.checked = (user?.state || 'present') === 'present';
  userKeysInput.value = (user?.ssh_keys || []).join('\n');
  userEditor.classList.remove('d-none');
}

function closeUserEditor() {
  editingUserIndex = null;
  userEditor.classList.add('d-none');
}

function validateUserInput(nextUser) {
  validateUserDraft(nextUser, users, editingUserIndex);
}

function inferEnvironmentType(environmentName) {
  if (environmentName === 'staging' || environmentName === 'production') {
    return 'production';
  }

  return 'non-production';
}

function syncCustomEnvironmentField() {
  const isCustom = environmentNameInput.value === '__custom__';
  customEnvironmentField.classList.toggle('d-none', !isCustom);
  customEnvironmentNameInput.required = isCustom;
  if (!isCustom) {
    environmentTypeInput.value = inferEnvironmentType(environmentNameInput.value);
  }
}

function populateEnvironmentScreen(result) {
  const choices = result.environmentChoices || [
    { name: 'Development', value: 'development' },
    { name: 'Quality assurance (no PII data)', value: 'qa' },
    { name: 'Staging (hosts PII data, no backups)', value: 'staging' },
    {
      name: 'Production (hosts PII data, requires frequent backups)',
      value: 'production'
    }
  ];
  environmentNameInput.innerHTML = '';

  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.name;
    environmentNameInput.appendChild(option);
  }

  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Custom environment';
  environmentNameInput.appendChild(customOption);

  githubApproversInput.value = result.githubApprovers || '';
  approvalRequiredInput.checked = false;
  syncCustomEnvironmentField();
  if (hasDeploymentFeature('github')) {
    loadEnvironmentPreview();
  }
}

async function loadEnvironmentPreview() {
  const requestId = ++environmentPreviewRequest;
  const environmentName = environmentNameInput.value;

  if (!environmentName || environmentName === '__custom__') {
    approvalRequiredInput.checked = false;
    approvalRequiredInput.disabled = false;
    return;
  }

  approvalRequiredInput.disabled = true;

  try {
    const response = await fetch('/api/environment-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ environmentName })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Could not load environment settings.');
    }

    if (requestId === environmentPreviewRequest) {
      approvalRequiredInput.checked = Boolean(result.approvalRequired);
    }
  } catch (error) {
    if (requestId === environmentPreviewRequest) {
      showEnvironmentStatus('error', error.message || 'Could not load environment settings.');
    }
  } finally {
    if (requestId === environmentPreviewRequest) {
      approvalRequiredInput.disabled = false;
    }
  }
}

function renderConfigurationScreen(screenId) {
  const controller = configurationControllers.get(screenId);
  if (!controller) {
    return;
  }

  const getFieldSubScreen = (field) => field.subScreen || 'general';
  const getCustomComponentSubScreen = (component) =>
    component.dataset.customSubScreen || 'general';
  let fields = controller.fields;
  if (controller.definition.subScreens?.length) {
    const availableSubScreens = controller.definition.subScreens
      .slice()
      .sort((left, right) => left.order - right.order)
      .filter((subScreen) =>
        controller.fields.some(
          (field) => getFieldSubScreen(field) === subScreen.id
        ) ||
        controller.customSubScreenComponents.some(
          (component) => getCustomComponentSubScreen(component) === subScreen.id
        )
      );
    if (!availableSubScreens.some(({ id }) => id === controller.selectedSubScreen)) {
      controller.selectedSubScreen = availableSubScreens[0]?.id || null;
    }
    for (const tab of controller.tabs) {
      const available = availableSubScreens.some(
        ({ id }) => id === tab.dataset.subScreen
      );
      const active = available && tab.dataset.subScreen === controller.selectedSubScreen;
      tab.classList.toggle('d-none', !available);
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    fields = controller.fields.filter(
      (field) => getFieldSubScreen(field) === controller.selectedSubScreen
    );
  }
  for (const component of controller.customSubScreenComponents) {
    const visible =
      !controller.definition.subScreens?.length ||
      getCustomComponentSubScreen(component) === controller.selectedSubScreen;
    component.classList.toggle('d-none', !visible);
  }

  controller.renderer = renderConfigurationForm({
    container: controller.fieldsContainer,
    fields,
    values: controller.values,
    existingSecrets: controller.existingSecrets,
    secretSentinel: existingSecretSentinel,
    idPrefix: screenId + '-',
    context: controller.context
  });
  syncBackupWithoutAnsibleWarning(controller);
}

function populateConfigurationScreen(state) {
  const screenId = state?.definition?.id;
  const controller = configurationControllers.get(screenId);
  if (!controller) {
    return;
  }

  controller.fields = Array.isArray(state.fields) ? state.fields : [];
  controller.values = Object.fromEntries(
    controller.fields.map((field) => [
      field.id,
      state.values?.[field.id] ?? field.defaultValue ?? ''
    ])
  );
  controller.existingSecrets = state.existingSecrets || {};
  controller.context = state.context || {};
  existingSecretSentinel = state.secretSentinel || existingSecretSentinel;

  if (controller.definition.customComponents?.includes('users')) {
    users = Array.isArray(state.custom?.users) ? state.custom.users : [];
    renderUsers();
    closeUserEditor();
  }

  renderConfigurationScreen(screenId);
}

function populateConfigurationScreens(states) {
  for (const state of states || []) {
    populateConfigurationScreen(state);
  }
}

function renderReview(plan) {
  renderReviewTable(plan, {
    reviewFiles,
    reviewVariables,
    reviewSecrets,
    reviewHelmValues
  });
}

function renderFinalizeSummary(actions, nextSteps, valuesSecretsFile) {
  renderFinalizeSummaryContent(finalizeSummary, actions, nextSteps, valuesSecretsFile);
}

async function loadReview() {
  const plan = await getJson('/api/review');
  renderReview(plan);
}

async function loadDefaults() {
  const defaults = await getJson('/api/github/defaults');

  organisationInput.value = defaults.organisation || '';
  repositoryInput.value = defaults.repository || '';
  if (defaults.setupOptions) {
    enableGithubIntegrationInput.checked = defaults.setupOptions.enableGithubIntegration !== false;
    infrastructureTypeInput.value = defaults.setupOptions.infrastructureType || 'on-premise';
  }
  deploymentFeatures = defaults.deploymentFeatures || deploymentFeatures;
  syncGitHubVisibility();
  addCurrentUserButton.classList.toggle(
    'd-none',
    defaults.currentSystemUserAvailable === false
  );
}

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setupButton.disabled = true;
  setupButton.textContent = 'Saving...';
  showSetupStatus('', 'Saving setup type...');

  try {
    const response = await fetch('/api/setup-options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enableGithubIntegration: enableGithubIntegrationInput.checked,
        infrastructureType: infrastructureTypeInput.value
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Setup type could not be saved.');
    }

    deploymentFeatures = result.setupOptions?.deploymentFeatures || deploymentFeatures;
    syncGitHubVisibility();
    showSetupStatus('success', 'Setup type saved.');

    if (hasDeploymentFeature('github')) {
      githubNavigation.disabled = false;
      showScreen('github');
    } else {
      openEnvironmentStep(result);
      showScreen('github');
    }
  } catch (error) {
    showSetupStatus('error', error.message || 'Setup type could not be saved.');
  } finally {
    setupButton.disabled = false;
    setupButton.textContent = 'Continue';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = 'Connecting...';
  showStatus('', 'Checking repository access...');

  try {
    const response = await fetch('/api/github/connect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        organisation: organisationInput.value.trim(),
        repository: repositoryInput.value.trim(),
        token: tokenInput.value.trim()
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'GitHub connection failed.');
    }

    showStatus(
      'success',
      'Connected to ' + result.organisation + '/' + result.repository + '.'
    );
    completeGitHubLogin(result);
  } catch (error) {
    showStatus('error', error.message || 'GitHub connection failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Login';
  }
});

environmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  environmentButton.disabled = true;
  environmentButton.textContent = 'Saving...';
  showEnvironmentStatus('', 'Saving environment selection...');

  try {
    const response = await fetch('/api/environment-selection', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        environmentName: environmentNameInput.value,
        customEnvironmentName: customEnvironmentNameInput.value.trim(),
        environmentType: environmentTypeInput.value,
        approvalRequired: approvalRequiredInput.checked,
        githubApprovers: githubApproversInput.value.trim()
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Environment selection failed.');
    }

    approvalRequiredInput.checked = Boolean(result.approvalRequired);
    deploymentFeatures = result.deploymentFeatures || deploymentFeatures;
    syncConfigurationAvailability(result.configuration);
    populateConfigurationScreens(result.configuration);
    enableConfigurationNavigation();
    showEnvironmentStatus('success', 'Environment selection saved.');
    showScreen([...enabledConfigurationScreens][0] || 'review');
  } catch (error) {
    showEnvironmentStatus('error', error.message || 'Environment selection failed.');
  } finally {
    environmentButton.disabled = false;
    environmentButton.textContent = 'Save environment';
  }
});

for (const [screenId, controller] of configurationControllers) {
  controller.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    controller.submitButton.disabled = true;
    controller.submitButton.textContent = 'Saving...';
    showConfigurationStatus(screenId, '', 'Saving ' + controller.definition.label.toLowerCase() + ' configuration...');

    try {
      const custom = controller.definition.customComponents?.includes('users')
        ? { users }
        : {};
      const response = await fetch('/api/configuration/' + encodeURIComponent(screenId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ values: controller.values, custom })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || controller.definition.label + ' configuration failed.');
      }

      if (Array.isArray(result.configuration)) {
        populateConfigurationScreens(result.configuration);
      } else {
        populateConfigurationScreen(result.screen);
      }
      setConfigurationDirty(screenId, false);
      await loadReview();
      enableReviewNavigation();
      showConfigurationStatus(screenId, 'success', controller.definition.savedMessage);
      const configuredNextScreen = controller.definition.nextScreen;
      showScreen(
        configuredNextScreen && enabledConfigurationScreens.has(configuredNextScreen)
          ? configuredNextScreen
          : getNextAvailableScreen(screenId)
      );
    } catch (error) {
      showConfigurationStatus(
        screenId,
        'error',
        error.message || controller.definition.label + ' configuration failed.'
      );
    } finally {
      controller.submitButton.disabled = false;
      controller.submitButton.textContent = controller.definition.submitLabel;
    }
  });
}

finalizeButton.addEventListener('click', async () => {
  finalizeButton.disabled = true;
  finalizeButton.textContent = 'Finalizing...';
  showReviewStatus(
    '',
    hasDeploymentFeature('github')
      ? 'Generating files and updating GitHub environment...'
      : 'Generating configuration files...'
  );
  startFinalizeProgress();

  try {
    const result = await postJson('/api/finalize');
    finishFinalizeProgress(true);

    renderReview(result);
    for (const section of document.querySelectorAll('.review-section')) {
      section.open = false;
    }
    renderFinalizeSummary(
      result.performedActions,
      result.nextSteps,
      result.valuesSecretsFile
    );
    finalizeButton.classList.add('d-none');
    reviewStatusBox.classList.add('d-none');
  } catch (error) {
    finishFinalizeProgress(false);
    showReviewStatus('error', error.message || 'Finalize failed.');
    finalizeButton.disabled = false;
    finalizeButton.textContent = 'Finalize setup';
  } finally {
  }
});

usersTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  const action = button.dataset.action;

  if (action === 'edit') {
    openUserEditor(users[index], index);
  }

  if (action === 'remove') {
    const user = users[index];
    if (!window.confirm('Remove user "' + user.name + '" from this configuration?')) {
      return;
    }

    users.splice(index, 1);
    renderUsers();
    closeUserEditor();
    setConfigurationDirty('infrastructure', true);
  }
});

addUserButton.addEventListener('click', () => {
  openUserEditor({
    name: '',
    ssh_keys: [],
    state: 'present',
    role: 'operator'
  }, null);
});

addCurrentUserButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/current-user');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Could not load current system user.');
    }

    if (!result.user.ssh_keys.length) {
      showConfigurationStatus('infrastructure', 'error', 'No SSH public keys found for the current system user.');
      return;
    }

    if (users.some((user) => user.name === result.user.name)) {
      showConfigurationStatus('infrastructure', 'error', 'Current system user already exists.');
      return;
    }

    users.push(result.user);
    renderUsers();
    setConfigurationDirty('infrastructure', true);
    showConfigurationStatus('infrastructure', 'success', 'Current system user added.');
  } catch (error) {
    showConfigurationStatus('infrastructure', 'error', error.message || 'Could not load current system user.');
  }
});

saveUserButton.addEventListener('click', () => {
  try {
    const nextUser = {
      name: userNameInput.value.trim(),
      ssh_keys: parseUserKeys(userKeysInput.value),
      state: userPresentInput.checked ? 'present' : 'absent',
      role: userRoleInput.value
    };

    validateUserInput(nextUser);

    if (editingUserIndex === null) {
      users.push(nextUser);
    } else {
      users[editingUserIndex] = nextUser;
    }

    renderUsers();
    closeUserEditor();
    setConfigurationDirty('infrastructure', true);
    showConfigurationStatus('infrastructure', 'success', 'User saved.');
  } catch (error) {
    showConfigurationStatus('infrastructure', 'error', error.message || 'Could not save user.');
  }
});

cancelUserButton.addEventListener('click', closeUserEditor);

for (const navigationButton of configurationNavigation) {
  navigationButton.addEventListener('click', () => {
    showScreen(navigationButton.dataset.screen);
  });
}

reviewNavigation.addEventListener('click', () => {
  showScreen('review');
});

function updateConfigurationDraft(event, controller) {
  const input = event.target.closest('[data-config-field-id]');
  if (!input) {
    return false;
  }
  const field = controller.fields.find(({ id }) => id === input.dataset.configFieldId);
  if (input.type === 'checkbox') {
    input.indeterminate = false;
    controller.values[input.dataset.configFieldId] =
      field?.source?.target === 'github' ? String(input.checked) : input.checked;
  } else {
    controller.values[input.dataset.configFieldId] = input.value;
  }
  controller.renderer?.syncVisibility();
  syncBackupWithoutAnsibleWarning(controller);
  return true;
}

for (const [screenId, controller] of configurationControllers) {
  const updateDraft = (event) => {
    if (updateConfigurationDraft(event, controller)) {
      setConfigurationDirty(screenId, true);
    }
  };
  controller.form.addEventListener('input', updateDraft);
  controller.form.addEventListener('change', updateDraft);
  for (const tab of controller.tabs) {
    tab.addEventListener('click', () => {
      controller.selectedSubScreen = tab.dataset.subScreen;
      renderConfigurationScreen(screenId);
    });
  }
}

environmentNameInput.addEventListener('change', () => {
  syncCustomEnvironmentField();
  loadEnvironmentPreview();
});
renderUsers();

loadDefaults().catch(() => {
  showStatus('error', 'Could not load repository defaults.');
});
