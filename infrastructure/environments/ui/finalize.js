(function () {
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

  function appendRestartButton(container) {
    const actions = document.createElement('div');
    actions.className = 'actions d-flex gap-2 mt-4';
    const restartButton = document.createElement('button');
    restartButton.className = 'btn btn-outline-secondary';
    restartButton.type = 'button';
    restartButton.textContent = 'Restart configurator';
    restartButton.addEventListener('click', async () => {
      restartButton.disabled = true;
      restartButton.textContent = 'Restarting...';
      try {
        await fetch('/api/restart', { method: 'POST' });
      } finally {
        window.location.reload();
      }
    });
    actions.appendChild(restartButton);
    container.appendChild(actions);
  }

  function renderFinalizeSummary(container, actions, nextSteps, valuesSecretsFile) {
    const performedActions = actions || [];
    const steps = nextSteps || null;
    container.classList.remove('d-none');
    container.innerHTML = '';

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
    container.appendChild(actionsBox);

    const heading = document.createElement('h2');
    heading.className = 'h4 mt-4';
    heading.textContent = 'Next steps';
    container.appendChild(heading);

    const completionMessage = document.createElement('div');
    completionMessage.className = 'alert alert-success';
    completionMessage.setAttribute('role', 'status');
    completionMessage.textContent = 'Setup finalized. Follow the next steps below.';
    container.appendChild(completionMessage);

    if (valuesSecretsFile?.downloadUrl) {
      const secretsDownload = document.createElement('div');
      secretsDownload.className = 'alert alert-warning';
      const text = document.createElement('p');
      text.className = 'mb-2';
      text.textContent = 'Download the generated external Helm secrets file and store it securely.';
      const link = document.createElement('a');
      link.className = 'btn btn-outline-secondary btn-sm';
      link.href = valuesSecretsFile.downloadUrl;
      link.textContent = 'Download values.secrets.yaml';
      secretsDownload.append(text, link);
      container.appendChild(secretsDownload);
    }

    if (!steps) {
      appendRestartButton(container);
      return;
    }

    const primaryHeading = document.createElement('h3');
    primaryHeading.className = 'h5 mt-4';
    primaryHeading.textContent = steps.additionalHosts?.length
      ? 'Bootstrap the primary node'
      : 'Bootstrap the single-node cluster';
    container.appendChild(primaryHeading);

    const primaryInstruction = document.createElement('p');
    primaryInstruction.textContent = 'Run the following command on ' + steps.primaryHost + ':';
    container.appendChild(primaryInstruction);
    appendCommand(container, steps.primaryCommand || '');

    if (steps.additionalHosts?.length) {
      const runnerInformation = document.createElement('div');
      runnerInformation.className = 'alert alert-info';
      runnerInformation.textContent = 'The script will install a self-hosted GitHub runner and set up a user on your server called provision. At the end of this process, the script will display the provision user\'s public SSH key. You will need this key in the next step when setting up a backup integration (required for a PII staging or production environment) or a cluster.';
      container.appendChild(runnerInformation);

      appendCommand(container, [
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
      container.appendChild(additionalHeading);

      const hostsList = document.createElement('dl');
      hostsList.className = 'row small mb-3';
      const appendHosts = (label, hosts) => {
        if (!hosts?.length) {
          return;
        }
        const term = document.createElement('dt');
        term.className = 'col-sm-4';
        term.textContent = label;
        const description = document.createElement('dd');
        description.className = 'col-sm-8';
        description.textContent = hosts.join(', ');
        hostsList.append(term, description);
      };
      appendHosts('Worker nodes', steps.workerNodes || []);
      appendHosts('Backup server', steps.backupHost ? [steps.backupHost] : []);
      if (hostsList.children.length) {
        container.appendChild(hostsList);
      }

      const additionalInstruction = document.createElement('p');
      additionalInstruction.textContent = 'Run the following command on: ' +
        steps.additionalHosts.join(', ') + '.';
      container.appendChild(additionalInstruction);
      appendCommand(container, steps.additionalCommand || '');
    }

    appendRestartButton(container);
  }

  window.OpenCRVSFinalize = { renderFinalizeSummary };
})();
