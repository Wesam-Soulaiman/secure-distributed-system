const crypto = require("crypto");
const { VIRTUAL_NODES_PER_WEIGHT } = require("../config");
const { getHealthyNodes } = require("../state/nodes");

function hashString(input) {
  const hex = crypto.createHash("sha1").update(input).digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

function buildHashRing() {
  const ring = [];

  getHealthyNodes().forEach((node) => {
    const virtualNodeCount = node.weight * VIRTUAL_NODES_PER_WEIGHT;

    for (let i = 0; i < virtualNodeCount; i += 1) {
      ring.push({
        hash: hashString(`${node.id}-vn-${i}`),
        node,
        virtualNodeId: `${node.id}-vn-${i}`,
      });
    }
  });

  ring.sort((a, b) => a.hash - b.hash);

  return ring;
}

function pickNodeByConsistentHash(key) {
  const ring = buildHashRing();

  if (ring.length === 0) {
    return {
      selectedNode: null,
      hash: null,
      ringSize: 0,
      virtualNodeId: null,
      virtualNodeHash: null,
    };
  }

  const keyHash = hashString(key);

  const matchedVirtualNode =
    ring.find((item) => item.hash >= keyHash) || ring[0];

  return {
    selectedNode: matchedVirtualNode.node,
    hash: keyHash,
    ringSize: ring.length,
    virtualNodeId: matchedVirtualNode.virtualNodeId,
    virtualNodeHash: matchedVirtualNode.hash,
  };
}

module.exports = {
  hashString,
  buildHashRing,
  pickNodeByConsistentHash,
};
