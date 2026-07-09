(function () {
  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Request failed.');
    }

    return result;
  }

  function getJson(url) {
    return requestJson(url);
  }

  function postJson(url, body) {
    return requestJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  window.OpenCRVSApi = { getJson, postJson };
})();
