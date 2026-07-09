(function () {
  function buildConfigurationUi(configurationSchema) {
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

  window.OpenCRVSConfigurationScreens = { buildConfigurationUi };
})();
