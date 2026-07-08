let existingSecretSentinel = '';
const { renderForm: renderConfigurationForm } = window.OpenCRVSFormRenderer;
const configurationSchema = (window.OpenCRVSConfigurationSchema || [])
  .slice()
  .sort((left, right) => left.order - right.order);

function buildConfigurationUi() {
  const navigation = document.querySelector('.steps');
  const reviewItem = document.querySelector('#review-navigation').closest('li');
  const screensContainer = document.querySelector('#configuration-screens');
  const customComponents = {
    users: document.querySelector('#users-configuration-component')
  };

  for (const definition of configurationSchema) {
    const navigationItem = document.createElement('li');
    const navigationButton = document.createElement('button');
    navigationButton.className = 'step nav-link configuration-navigation';
    navigationButton.type = 'button';
    navigationButton.dataset.screen = definition.id;
    navigationButton.disabled = true;
    navigationButton.appendChild(document.createTextNode(definition.label));
    const dirtyIndicator = document.createElement('span');
    dirtyIndicator.id = definition.id + '-dirty';
    dirtyIndicator.className = 'dirty-indicator d-none';
    dirtyIndicator.setAttribute('aria-label', 'Unsaved changes');
    dirtyIndicator.textContent = '*';
    navigationButton.appendChild(dirtyIndicator);
    navigationItem.appendChild(navigationButton);
    navigation.insertBefore(navigationItem, reviewItem);

    const section = document.createElement('section');
    section.id = definition.id + '-screen';
    section.className = 'screen';
    const heading = document.createElement('h1');
    heading.textContent = definition.label;
    const description = document.createElement('p');
    description.className = 'lede text-body-secondary small';
    description.textContent = definition.description;
    section.append(heading, description);

    if (definition.subScreens?.length) {
      const tabs = document.createElement('div');
      tabs.className = 'configuration-tabs nav nav-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', definition.label + ' sections');
      for (const subScreen of definition.subScreens
        .slice()
        .sort((left, right) => left.order - right.order)) {
        const tab = document.createElement('button');
        tab.className = 'configuration-tab nav-link';
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', 'false');
        tab.dataset.subScreen = subScreen.id;
        tab.textContent = subScreen.label;
        tabs.appendChild(tab);
      }
      section.appendChild(tabs);
    }

    const form = document.createElement('form');
    form.id = definition.id + '-form';
    form.className = 'configuration-form';
    const fields = document.createElement('div');
    fields.id = definition.id + '-fields';
    form.appendChild(fields);
    for (const componentId of definition.customComponents || []) {
      const component = customComponents[componentId];
      if (component) {
        form.appendChild(component);
      }
    }
    const actions = document.createElement('div');
    actions.className = 'actions d-flex gap-2';
    const submitButton = document.createElement('button');
    submitButton.id = definition.id + '-button';
    submitButton.className = 'btn btn-primary';
    submitButton.type = 'submit';
    submitButton.textContent = definition.submitLabel;
    actions.appendChild(submitButton);
    form.appendChild(actions);
    section.appendChild(form);

    const status = document.createElement('div');
    status.id = definition.id + '-status';
    status.className = 'status alert d-none';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    section.appendChild(status);
    screensContainer.appendChild(section);
  }
}

buildConfigurationUi();
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
const reviewNavigation = document.querySelector('#review-navigation');
const authenticationPart = document.querySelector('#authentication-part');
const environmentPart = document.querySelector('#environment-part');
const connectionSummary = document.querySelector('#connection-summary');
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
let users = [];
let editingUserIndex = null;
let environmentPreviewRequest = 0;
const configurationControllers = new Map(
  configurationSchema.map((definition) => [
    definition.id,
    {
      definition,
      form: document.querySelector('#' + definition.id + '-form'),
      fieldsContainer: document.querySelector('#' + definition.id + '-fields'),
      submitButton: document.querySelector('#' + definition.id + '-button'),
      status: document.querySelector('#' + definition.id + '-status'),
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

function showConfigurationStatus(screenId, type, message) {
  const status = configurationControllers.get(screenId)?.status;
  if (!status) {
    return;
  }
  status.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  status.textContent = message;
}

function showReviewStatus(type, message) {
  reviewStatusBox.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  reviewStatusBox.textContent = message;
}

function showEnvironmentStatus(type, message) {
  environmentStatusBox.className = 'status alert alert-' + (type === 'error' ? 'danger' : type || 'secondary');
  environmentStatusBox.textContent = message;
}

function showScreen(screenName) {
  for (const screen of document.querySelectorAll('.screen')) {
    screen.classList.toggle('active', screen.id === screenName + '-screen');
  }
  for (const step of steps) {
    step.classList.toggle('active', step.dataset.screen === screenName);
  }

  for (const navigationButton of configurationNavigation) {
    if (navigationButton.dataset.screen === screenName) {
      navigationButton.setAttribute('aria-current', 'step');
    } else {
      navigationButton.removeAttribute('aria-current');
    }
  }

  if (screenName === 'review') {
    reviewNavigation.setAttribute('aria-current', 'step');
  } else {
    reviewNavigation.removeAttribute('aria-current');
  }
}

function enableConfigurationNavigation() {
  for (const navigationButton of configurationNavigation) {
    navigationButton.disabled = false;
  }
}

function enableReviewNavigation() {
  reviewNavigation.disabled = false;
}

function setConfigurationDirty(screenName, dirty) {
  const indicator = document.querySelector('#' + screenName + '-dirty');
  indicator?.classList.toggle('d-none', !dirty);
}

function completeGitHubLogin(result) {
  populateEnvironmentScreen(result);
  connectionSummary.textContent = 'Connected to ' + result.organisation + '/' + result.repository + '.';
  authenticationPart.classList.add('d-none');
  environmentPart.classList.remove('d-none');
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

function parseUserKeys() {
  return userKeysInput.value
    .split('\n')
    .map((key) => key.trim())
    .filter((key) => key && !key.startsWith('#'));
}

function validateUserInput(nextUser) {
  if (!nextUser.name) {
    throw new Error('Username required.');
  }

  if (!/^[a-z_][a-z0-9_-]*[$]?$/.test(nextUser.name)) {
    throw new Error('Invalid username format.');
  }

  const duplicate = users.find((user, index) => {
    return user.name === nextUser.name && index !== editingUserIndex;
  });

  if (duplicate) {
    throw new Error('User "' + nextUser.name + '" already exists.');
  }
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
  const choices = result.environmentChoices || [];
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
  loadEnvironmentPreview();
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

  let fields = controller.fields;
  if (controller.definition.subScreens?.length) {
    const availableSubScreens = controller.definition.subScreens
      .slice()
      .sort((left, right) => left.order - right.order)
      .filter((subScreen) =>
        controller.fields.some(
          (field) => !field.subScreen || field.subScreen === subScreen.id
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
      (field) => !field.subScreen || field.subScreen === controller.selectedSubScreen
    );
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

function appendReviewRow(container, values) {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.appendChild(cell);
  }
  container.appendChild(row);
}

function renderReview(plan) {
  reviewFiles.innerHTML = '';
  reviewVariables.innerHTML = '';
  reviewSecrets.innerHTML = '';
  reviewHelmValues.innerHTML = '';

  for (const file of plan.files || []) {
    const item = document.createElement('li');
    item.textContent = file;
    reviewFiles.appendChild(item);
  }

  for (const variable of plan.variables || []) {
    appendReviewRow(reviewVariables, [
      variable.scope,
      variable.name,
      variable.value,
      variable.action
    ]);
  }

  for (const secret of plan.secrets || []) {
    const status = secret.exists ? 'Exists in GitHub' : 'Missing in GitHub';
    appendReviewRow(reviewSecrets, [
      secret.scope,
      secret.name,
      status,
      secret.action
    ]);
  }

  for (const update of plan.helmUpdates || []) {
    appendReviewRow(reviewHelmValues, [
      update.chart,
      update.path,
      update.value,
      update.action
    ]);
  }
}

function appendCommand(container, command, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block position-relative';
  const pre = document.createElement('pre');
  pre.className = 'bg-body-tertiary border rounded p-3 mb-0';
  if (options.copyable !== false) {
    pre.classList.add('pt-5');
  }
  if (options.small) {
    pre.classList.add('small');
  }
  const code = document.createElement('code');
  code.textContent = command;
  pre.appendChild(code);
  wrapper.appendChild(pre);

  if (options.copyable !== false) {
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button btn btn-sm btn-outline-secondary';
    copyButton.type = 'button';
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(command);
        copyButton.textContent = 'Copied!';
      } catch {
        copyButton.textContent = 'Copy failed';
      }
      window.setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 2000);
    });
    wrapper.appendChild(copyButton);
  }

  container.appendChild(wrapper);
}

function renderFinalizeSummary(actions, nextSteps) {
  const performedActions = actions || [];
  const steps = nextSteps || {};
  finalizeSummary.classList.remove('d-none');
  finalizeSummary.innerHTML = '';

  const actionsBox = document.createElement('details');
  actionsBox.className = 'alert alert-success';
  const actionsHeading = document.createElement('summary');
  actionsHeading.className = 'fw-semibold';
  actionsHeading.textContent = 'Performed actions';
  const actionsList = document.createElement('ul');
  actionsList.className = 'mb-0';
  for (const action of performedActions) {
    const item = document.createElement('li');
    item.textContent = action;
    actionsList.appendChild(item);
  }
  actionsBox.append(actionsHeading, actionsList);
  finalizeSummary.appendChild(actionsBox);

  const heading = document.createElement('h2');
  heading.className = 'h4 mt-4';
  heading.textContent = 'Next steps';
  finalizeSummary.appendChild(heading);

  const completionMessage = document.createElement('div');
  completionMessage.className = 'alert alert-success';
  completionMessage.setAttribute('role', 'status');
  completionMessage.textContent = 'Setup finalized. Follow the next steps below.';
  finalizeSummary.appendChild(completionMessage);

  const primaryHeading = document.createElement('h3');
  primaryHeading.className = 'h5 mt-4';
  primaryHeading.textContent = steps.additionalHosts?.length
    ? 'Bootstrap the primary node'
    : 'Bootstrap the single-node cluster';
  finalizeSummary.appendChild(primaryHeading);

  const primaryInstruction = document.createElement('p');
  primaryInstruction.textContent = 'Run the following command on ' + steps.primaryHost + ':';
  finalizeSummary.appendChild(primaryInstruction);
  appendCommand(finalizeSummary, steps.primaryCommand || '');

  if (steps.additionalHosts?.length) {
    const runnerInformation = document.createElement('div');
    runnerInformation.className = 'alert alert-info';
    runnerInformation.textContent = 'The script will install a self-hosted GitHub runner and set up a user on your server called provision. At the end of this process, the script will display the provision user\'s public SSH key. You will need this key in the next step when setting up a backup integration (required for a PII staging or production environment) or a cluster.';
    finalizeSummary.appendChild(runnerInformation);

    appendCommand(finalizeSummary, [
      "✅ Runner 'prod-runner' is installed and started!",
      '',
      '⚠️ ⚠️ ⚠️ ⚠️ ⚠️ Store the following public key for later usage ⚠️ ⚠️ ⚠️ ⚠️ ⚠️',
      '⚙️  provision SSH key pair public key (add on worker nodes if needed):',
      '',
      'ssh-ed25519 AAAAC3NzaC....F5uYOPl+ provision@prod1',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '✅ Node bootstrap complete for tmp-prod1.',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'), { copyable: false, small: true });

    const additionalHeading = document.createElement('h3');
    additionalHeading.className = 'h5 mt-4';
    additionalHeading.textContent = 'Bootstrap worker nodes and backup server';
    finalizeSummary.appendChild(additionalHeading);

    const additionalInstruction = document.createElement('p');
    additionalInstruction.textContent = 'Run the following command on: ' +
      steps.additionalHosts.join(', ') + '.';
    finalizeSummary.appendChild(additionalInstruction);
    appendCommand(finalizeSummary, steps.additionalCommand || '');
  }
}

async function loadReview() {
  const response = await fetch('/api/review');
  const plan = await response.json();

  if (!response.ok) {
    throw new Error(plan.error || 'Could not load review plan.');
  }

  renderReview(plan);
}

async function loadDefaults() {
  const response = await fetch('/api/github/defaults');
  const defaults = await response.json();

  organisationInput.value = defaults.organisation || '';
  repositoryInput.value = defaults.repository || '';
  addCurrentUserButton.classList.toggle(
    'd-none',
    defaults.currentSystemUserAvailable === false
  );
}

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
    populateConfigurationScreens(result.configuration);
    enableConfigurationNavigation();
    showEnvironmentStatus('success', 'Environment selection saved.');
    showScreen(configurationSchema[0]?.id || 'review');
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

      populateConfigurationScreen(result.screen);
      setConfigurationDirty(screenId, false);
      await loadReview();
      enableReviewNavigation();
      showConfigurationStatus(screenId, 'success', controller.definition.savedMessage);
      showScreen(controller.definition.nextScreen || 'review');
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
  showReviewStatus('', 'Generating files and updating GitHub environment...');

  try {
    const response = await fetch('/api/finalize', {
      method: 'POST'
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Finalize failed.');
    }

    renderReview(result);
    for (const section of document.querySelectorAll('.review-section')) {
      section.open = false;
    }
    renderFinalizeSummary(result.performedActions, result.nextSteps);
    finalizeButton.classList.add('d-none');
    reviewStatusBox.classList.add('d-none');
  } catch (error) {
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
      ssh_keys: parseUserKeys(),
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
