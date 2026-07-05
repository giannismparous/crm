import type { Edge, Node } from "@xyflow/react";
import type { OrgChartNodeData } from "./OrgChartNode";

export const ORG_CHART_EDGES: Edge[] = [
  { id: "e-founders-ceo", source: "founders", target: "ceo", type: "straight" },
  { id: "e-ceo-head-ops", source: "ceo", target: "head-ops", type: "straight" },
  { id: "e-head-product", source: "head-ops", target: "dept-product", type: "smoothstep" },
  { id: "e-head-sales", source: "head-ops", target: "dept-sales", type: "smoothstep" },
  { id: "e-head-marketing", source: "head-ops", target: "dept-marketing", type: "smoothstep" },
  { id: "e-head-pr", source: "head-ops", target: "dept-pr", type: "smoothstep" },
  { id: "e-head-customer", source: "head-ops", target: "dept-customer", type: "smoothstep" },
  { id: "e-head-consulting", source: "head-ops", target: "dept-consulting", type: "smoothstep" },
];

export const ORG_CHART_LAYOUT_EDGES: Edge[] = ORG_CHART_EDGES.filter((e) => e.target !== "dept-consulting");

export const DEPARTMENT_NODE_IDS = [
  "dept-product",
  "dept-sales",
  "dept-marketing",
  "dept-pr",
  "dept-customer",
] as const;

export const ORG_CHART_NODES: Node<OrgChartNodeData>[] = [
  {
    id: "founders",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "founders",
      titleKey: "operations.foundersBadge",
      accent: "indigo",
      preferFounder: true,
      members: [
        { name: "Στέργιος" },
        { name: "Δημήτρης" },
        { name: "Γιάννης" },
        { name: "Χαρά" },
        { name: "Αναστασία" },
      ],
    },
  },
  {
    id: "ceo",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "leader",
      titleKey: "operations.orgChart.role.ceo",
      name: "Στέργιος",
      accent: "indigo",
      preferFounder: true,
    },
  },
  {
    id: "head-ops",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "leader",
      titleKey: "operations.orgChart.role.headOps",
      accent: "teal",
      preferFounder: true,
      members: [{ name: "Δημήτρης" }, { name: "Γιάννης" }],
    },
  },
  {
    id: "dept-product",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "department",
      titleKey: "operations.orgChart.dept.product",
      accent: "violet",
      members: [{ name: "Γιάννης" }, { name: "Στέργιος" }],
    },
  },
  {
    id: "dept-sales",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "department",
      titleKey: "operations.orgChart.dept.sales",
      accent: "amber",
      members: [{ name: "Δημήτρης" }, { name: "Στέφανος" }],
    },
  },
  {
    id: "dept-marketing",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "department",
      titleKey: "operations.orgChart.dept.marketing",
      accent: "fuchsia",
      members: [{ name: "Έλενα" }, { name: "Χαρά" }, { name: "Pantelis" }],
    },
  },
  {
    id: "dept-pr",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "department",
      titleKey: "operations.orgChart.dept.pr",
      accent: "rose",
      members: [{ name: "Αναστασία" }, { name: "Χαρά" }],
    },
  },
  {
    id: "dept-customer",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "department",
      titleKey: "operations.orgChart.dept.customer",
      accent: "sky",
      members: [{ name: "Δημήτρης" }, { name: "Αναστασία" }],
    },
  },
  {
    id: "dept-consulting",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "department",
      titleKey: "operations.orgChart.dept.consulting",
      accent: "slate",
      members: [
        { name: "Στέργιος" },
        { name: "Δημήτρης" },
        { name: "Γιάννης" },
        { name: "Αναστασία" },
        { name: "Στέφανος" },
      ],
    },
  },
];
