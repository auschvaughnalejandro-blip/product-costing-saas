import type { BomNode, CostNode } from '@costing/shared';

/** Find a BOM node by id anywhere in the tree (mutating-friendly: returns the node). */
export function findBomNode(node: BomNode, id: string): BomNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findBomNode(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Flatten a cost result tree into a lookup by node id. */
export function indexCostNodes(node: CostNode, into = new Map<string, CostNode>()): Map<string, CostNode> {
  into.set(node.id, node);
  for (const child of node.children) indexCostNodes(child, into);
  return into;
}

/** Ids of BOM nodes whose quantity differs between two trees. */
export function changedQuantities(a: BomNode, b: BomNode, into = new Set<string>()): Set<string> {
  if (String(a.quantity) !== String(b.quantity)) into.add(a.id);
  const bChildren = b.children ?? [];
  (a.children ?? []).forEach((child, i) => {
    const other = bChildren[i];
    if (other) changedQuantities(child, other, into);
  });
  return into;
}
