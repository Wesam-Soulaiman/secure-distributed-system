const routingState = {
  lastRoutedRequest: null,
};

function setLastRoutedRequest(request) {
  routingState.lastRoutedRequest = request;
}

function getLastRoutedRequest() {
  return routingState.lastRoutedRequest;
}

function clearLastRoutedRequest() {
  routingState.lastRoutedRequest = null;
}

module.exports = {
  setLastRoutedRequest,
  getLastRoutedRequest,
  clearLastRoutedRequest,
};
