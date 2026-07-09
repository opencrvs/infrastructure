(function () {
  function appendReviewRow(container, values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    container.appendChild(row);
  }

  function formatGithubScope(scope) {
    return scope === 'REPOSITORY' ? 'REPO' : scope === 'ENVIRONMENT' ? 'ENV' : scope;
  }

  function formatGithubStatus(update) {
    return update.exists ? 'Exists' : 'New';
  }

  function renderReview(plan, elements) {
    elements.reviewFiles.innerHTML = '';
    elements.reviewVariables.innerHTML = '';
    elements.reviewSecrets.innerHTML = '';
    elements.reviewHelmValues.innerHTML = '';

    for (const file of plan.files || []) {
      const item = document.createElement('li');
      item.textContent = file;
      elements.reviewFiles.appendChild(item);
    }

    for (const variable of plan.variables || []) {
      appendReviewRow(elements.reviewVariables, [
        formatGithubScope(variable.scope),
        variable.name,
        variable.value,
        formatGithubStatus(variable),
        variable.action
      ]);
    }

    for (const secret of plan.secrets || []) {
      appendReviewRow(elements.reviewSecrets, [
        formatGithubScope(secret.scope),
        secret.name,
        formatGithubStatus(secret),
        secret.action
      ]);
    }

    for (const update of plan.helmUpdates || []) {
      appendReviewRow(elements.reviewHelmValues, [
        update.chart,
        update.path,
        update.value,
        update.action
      ]);
    }

    elements.reviewFiles.closest('.review-section').classList.toggle('d-none', !(plan.files || []).length);
    elements.reviewVariables.closest('.review-section').classList.toggle('d-none', !(plan.variables || []).length);
    elements.reviewSecrets.closest('.review-section').classList.toggle('d-none', !(plan.secrets || []).length);
    elements.reviewHelmValues.closest('.review-section').classList.toggle('d-none', !(plan.helmUpdates || []).length);
  }

  window.OpenCRVSReview = {
    renderReview
  };
})();
