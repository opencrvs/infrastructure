(function () {
  function parseUserKeys(value) {
    return value
      .split('\n')
      .map((key) => key.trim())
      .filter((key) => key && !key.startsWith('#'));
  }

  function validateUserInput(nextUser, users, editingUserIndex) {
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

  window.OpenCRVSUsers = {
    parseUserKeys,
    validateUserInput
  };
})();
