(function () {
  function conditionMatches(condition, values) {
    return !condition || values[condition.fieldId] === condition.equals;
  }

  function isRequired(field, context) {
    return Boolean(
      field.required ||
      field.validator ||
      (field.requiredWhen &&
        context[field.requiredWhen.context] === field.requiredWhen.equals)
    );
  }

  function appendDescription(label, field) {
    if (!field.description) {
      return;
    }
    const description = document.createElement('span');
    description.className = 'form-text d-block small fw-normal';
    description.textContent = field.description;
    label.appendChild(description);
  }

  function createInput(field, value, secretExists, secretSentinel, idPrefix, context) {
    let input;

    if (field.control === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.indeterminate = secretExists && (value === '' || value === undefined);
      input.checked = value === true || value === 'true';
      input.className = 'form-check-input';
    } else if (field.control === 'select') {
      input = document.createElement('select');
      input.className = 'form-select';
      if (!isRequired(field, context)) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'Select a value';
        input.appendChild(emptyOption);
      }
      if (secretExists) {
        const existingOption = document.createElement('option');
        existingOption.value = secretSentinel;
        existingOption.textContent = 'Existing GitHub secret (unchanged)';
        input.appendChild(existingOption);
      }
      for (const optionDefinition of field.options || []) {
        const option = document.createElement('option');
        option.value = optionDefinition.value;
        option.textContent = optionDefinition.label;
        input.appendChild(option);
      }
      input.value = secretExists ? secretSentinel : value ?? '';
    } else {
      input = document.createElement(field.control === 'textarea' ? 'textarea' : 'input');
      input.className = 'form-control';
      if (field.control !== 'textarea') {
        input.type = field.control === 'password'
          ? 'password'
          : field.control === 'number'
            ? 'number'
            : 'text';
      }
      input.value = secretExists ? secretSentinel : value ?? '';
      input.autocomplete = field.control === 'password' ? 'new-password' : 'off';
      if (field.control === 'number') {
        input.min = '1';
        input.step = '1';
      }
    }

    input.id = idPrefix + field.id;
    input.dataset.configFieldId = field.id;
    input.disabled = Boolean(field.disabled);
    input.readOnly = Boolean(field.readonly);
    if (field.control !== 'checkbox') {
      input.required = isRequired(field, context);
    }

    return input;
  }

  function renderForm(options) {
    const {
      container,
      fields,
      values,
      existingSecrets = {},
      secretSentinel = '',
      idPrefix = 'configuration-',
      context = {},
      sectionClass = 'form-group'
    } = options;

    container.innerHTML = '';
    const sortFields = (items) => items.slice().sort((left, right) => {
      const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return fields.indexOf(left) - fields.indexOf(right);
    });
    const sections = [...new Set(fields.map((field) => field.section))];

    for (const sectionName of sections) {
      const section = document.createElement('div');
      section.className = sectionClass + ' configuration-section';
      const heading = document.createElement('h2');
      heading.className = 'group-title h5 border-top pt-3';
      heading.textContent = sectionName;
      section.appendChild(heading);

      for (const field of sortFields(fields.filter((item) => item.section === sectionName))) {
        const label = document.createElement('label');
        label.dataset.configFieldLabel = field.id;
        label.dataset.configFieldContainer = field.id;
        const secretExists = Boolean(existingSecrets[field.id]);
        const input = createInput(
          field,
          values[field.id],
          secretExists,
          secretSentinel,
          idPrefix,
          context
        );

        if (field.control === 'checkbox') {
          label.className = 'form-check';
          label.appendChild(input);
          const labelText = document.createElement('span');
          labelText.className = 'form-check-label';
          labelText.textContent = field.label;
          label.appendChild(labelText);
        } else {
          label.className = 'form-label fw-normal';
          label.appendChild(document.createTextNode(field.label));
          label.appendChild(input);
        }

        if (field.suggestions?.length) {
          const listId = input.id + '-suggestions';
          input.setAttribute('list', listId);
          const suggestions = document.createElement('datalist');
          suggestions.id = listId;
          for (const suggestion of field.suggestions) {
            const option = document.createElement('option');
            option.value = suggestion;
            suggestions.appendChild(option);
          }
          label.appendChild(suggestions);
        }

        appendDescription(label, field);
        if (secretExists && field.existingSecretBehavior === 'replace') {
          const replacement = document.createElement('div');
          replacement.className = 'secret-replacement d-grid gap-2';
          replacement.dataset.configFieldContainer = field.id;
          delete label.dataset.configFieldContainer;
          const existingNotice = document.createElement('div');
          existingNotice.className = 'secret-existing alert alert-secondary d-flex align-items-center justify-content-between gap-2 mb-0';
          const existingText = document.createElement('span');
          existingText.textContent = field.label + ' already exists in GitHub.';
          const replaceButton = document.createElement('button');
          replaceButton.className = 'btn btn-outline-secondary btn-sm';
          replaceButton.type = 'button';
          replaceButton.textContent = 'Replace';
          input.value = '';
          input.required = false;
          label.classList.add('d-none');
          replaceButton.addEventListener('click', () => {
            input.dataset.replacementRevealed = 'true';
            existingNotice.classList.add('d-none');
            label.classList.remove('d-none');
            input.required = isRequired(field, context);
            input.focus();
          });
          existingNotice.appendChild(existingText);
          existingNotice.appendChild(replaceButton);
          replacement.appendChild(existingNotice);
          replacement.appendChild(label);
          section.appendChild(replacement);
        } else {
          section.appendChild(label);
        }
      }

      container.appendChild(section);
    }

    function syncVisibility() {
      for (const field of fields) {
        const label = container.querySelector(
          '[data-config-field-label="' + field.id + '"]'
        );
        const fieldContainer = container.querySelector(
          '[data-config-field-container="' + field.id + '"]'
        );
        const input = container.querySelector(
          '[data-config-field-id="' + field.id + '"]'
        );
        if (!label || !input || !fieldContainer) {
          continue;
        }
        const visible = conditionMatches(field.visibleWhen, values);
        fieldContainer.classList.toggle('d-none', !visible);
        if (field.control !== 'checkbox') {
          const waitsForReplacement =
            Boolean(existingSecrets[field.id]) &&
            field.existingSecretBehavior === 'replace' &&
            input.dataset.replacementRevealed !== 'true';
          input.required = visible && !waitsForReplacement && isRequired(field, context);
        }
      }
    }

    syncVisibility();
    return { syncVisibility };
  }

  window.OpenCRVSFormRenderer = { renderForm };
})();
