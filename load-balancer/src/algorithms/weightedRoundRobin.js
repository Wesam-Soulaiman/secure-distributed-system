const { getRoutableNodes } = require("../state/nodes");

let weightedSequence = [];
let weightedIndex = 0;

function rebuildWeightedSequence() {
  weightedSequence = [];

  const routableNodes = getRoutableNodes();

  routableNodes.forEach((node) => {
    for (let i = 0; i < node.weight; i += 1) {
      weightedSequence.push(node);
    }
  });

  if (weightedIndex >= weightedSequence.length) {
    weightedIndex = 0;
  }
}

function pickNodeWeightedRoundRobin() {
  rebuildWeightedSequence();

  if (weightedSequence.length === 0) {
    return null;
  }

  const selectedNode = weightedSequence[weightedIndex];

  weightedIndex = (weightedIndex + 1) % weightedSequence.length;

  return selectedNode;
}

function getWeightedSequence() {
  rebuildWeightedSequence();
  return weightedSequence.map((node) => node.id);
}

function resetWeightedIndex() {
  weightedIndex = 0;
}

module.exports = {
  rebuildWeightedSequence,
  pickNodeWeightedRoundRobin,
  getWeightedSequence,
  resetWeightedIndex,
};
