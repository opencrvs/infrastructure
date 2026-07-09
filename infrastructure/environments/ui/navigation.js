(function () {
  function showScreen(screenName, elements) {
    for (const screen of document.querySelectorAll('.screen')) {
      screen.classList.toggle('active', screen.id === screenName + '-screen');
    }
    for (const step of elements.steps) {
      step.classList.toggle('active', step.dataset.screen === screenName);
    }

    for (const navigationButton of elements.configurationNavigation) {
      if (navigationButton.dataset.screen === screenName) {
        navigationButton.setAttribute('aria-current', 'step');
      } else {
        navigationButton.removeAttribute('aria-current');
      }
    }

    if (screenName === 'review') {
      elements.reviewNavigation.setAttribute('aria-current', 'step');
    } else {
      elements.reviewNavigation.removeAttribute('aria-current');
    }
  }

  window.OpenCRVSNavigation = { showScreen };
})();
