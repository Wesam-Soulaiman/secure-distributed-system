const { store } = require("../state/store");

function applyEntryToStore(entry) {
  if (entry.operation === "SET") {
    store[entry.key] = entry.value;
  }

  if (entry.operation === "DELETE") {
    delete store[entry.key];
  }
}

function getValue(key) {
  return store[key] ?? null;
}

function getStoreKeys() {
  return Object.keys(store);
}

module.exports = {
  applyEntryToStore,
  getValue,
  getStoreKeys,
};
