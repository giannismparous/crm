import dagre from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";
import { DEPARTMENT_NODE_IDS } from "./orgChartData";
import type { OrgChartNodeData } from "./OrgChartNode";

/** Keep layout dimensions in sync with OrgChartNode CSS widths. */
export const ORG_CHART_FOUNDERS_WIDTH = 280;
export const ORG_CHART_FOUNDERS_HEIGHT = 96;
export const ORG_CHART_LEADER_WIDTH = 280;
export const ORG_CHART_DEPT_WIDTH = 220;

type LayoutNode = Node<OrgChartNodeData> & {
  targetPosition: Position;
  sourcePosition: Position;
};

function withChartHandles(node: Node<OrgChartNodeData>, patch: Partial<LayoutNode> = {}): LayoutNode {
  return {
    ...node,
    ...patch,
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  };
}

export function getOrgChartNodeSize(node: Node<OrgChartNodeData>): { width: number; height: number } {
  const data = node.data;
  if (data.variant === "founders") {
    return { width: ORG_CHART_FOUNDERS_WIDTH, height: ORG_CHART_FOUNDERS_HEIGHT };
  }
  if (data.variant === "leader") {
    const memberCount = data.members?.length ?? 0;
    if (memberCount > 0) return { width: ORG_CHART_LEADER_WIDTH, height: 88 + memberCount * 58 };
    return { width: ORG_CHART_LEADER_WIDTH, height: 124 };
  }
  const memberCount = data.members?.length ?? 0;
  return { width: ORG_CHART_DEPT_WIDTH, height: 60 + Math.max(1, memberCount) * 58 };
}

function nodeCenterX(node: LayoutNode): number {
  const width = node.width ?? getOrgChartNodeSize(node).width;
  return node.position.x + width / 2;
}

/** Dagre shifts CEO left/right to balance the wide ops subtree — keep the spine vertically stacked. */
function alignExecutiveSpine(nodes: LayoutNode[]): LayoutNode[] {
  const headOps = nodes.find((n) => n.id === "head-ops");
  if (!headOps) return nodes;

  const spineCenterX = nodeCenterX(headOps);
  const spineIds = new Set(["founders", "ceo", "head-ops"]);

  return nodes.map((node) => {
    if (!spineIds.has(node.id)) return node;
    const width = node.width ?? getOrgChartNodeSize(node).width;
    return withChartHandles(node, {
      position: { ...node.position, x: spineCenterX - width / 2 },
    });
  });
}

function placeConsultingBelowDepartments(nodes: LayoutNode[]): LayoutNode[] {
  const departments = nodes.filter((n) =>
    (DEPARTMENT_NODE_IDS as readonly string[]).includes(n.id)
  );
  const consulting = nodes.find((n) => n.id === "dept-consulting");
  if (!departments.length || !consulting) return nodes;

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const dept of departments) {
    const { width, height } = getOrgChartNodeSize(dept);
    minX = Math.min(minX, dept.position.x);
    maxX = Math.max(maxX, dept.position.x + width);
    maxY = Math.max(maxY, dept.position.y + height);
  }

  const { width } = getOrgChartNodeSize(consulting);
  const centeredX = (minX + maxX) / 2 - width / 2;
  const consultingY = maxY + 56;

  return nodes.map((node) =>
    node.id === "dept-consulting"
      ? withChartHandles(node, { position: { x: centeredX, y: consultingY } })
      : node
  );
}

export function layoutOrgChart(
  nodes: Node<OrgChartNodeData>[],
  edges: Edge[]
): { nodes: Node<OrgChartNodeData>[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: 24,
    ranksep: 64,
    marginx: 32,
    marginy: 32,
  });

  for (const node of nodes) {
    if (node.id === "dept-consulting") continue;
    const { width, height } = getOrgChartNodeSize(node);
    graph.setNode(node.id, { width, height });
  }

  for (const edge of edges) {
    if (edge.target === "dept-consulting") continue;
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  let layoutedNodes: LayoutNode[] = nodes.map((node) => {
    if (node.id === "dept-consulting") {
      return withChartHandles(node);
    }

    const pos = graph.node(node.id);
    const { width, height } = getOrgChartNodeSize(node);
    return withChartHandles(node, {
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
      width,
      height,
    });
  });

  layoutedNodes = alignExecutiveSpine(layoutedNodes);
  layoutedNodes = placeConsultingBelowDepartments(layoutedNodes);

  return { nodes: layoutedNodes, edges };
}
