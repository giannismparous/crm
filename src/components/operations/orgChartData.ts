import type { Edge, Node } from "@xyflow/react";
import type { OrgChartNodeData } from "./OrgChartNode";

export const ORG_CHART_EDGES: Edge[] = [
  { id: "e-founders-ceo", source: "founders", target: "ceo", type: "smoothstep" },
  { id: "e-ceo-head-ops", source: "ceo", target: "head-ops", type: "smoothstep" },
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
      variant: "board",
      title: "Συμβούλιο Founders / Co-Founders Board",
      subtitle: "Στέργιος · Δημήτρης · Γιάννης · Χαρά · Αναστασία",
      accent: "indigo",
      boardNames: true,
      preferFounder: true,
    },
  },
  {
    id: "ceo",
    type: "orgChart",
    position: { x: 0, y: 0 },
    data: {
      variant: "leader",
      title: "CEO",
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
      title: "Operations Team",
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
      title: "Τμήμα Product",
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
      title: "Τμήμα Sales",
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
      title: "Τμήμα Marketing",
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
      title: "Τμήμα Επικοινωνίας & Εξωστρέφειας (PR)",
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
      title: "Τμήμα Επικοινωνίας με Πελάτες",
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
      title: "Τμήμα Συμβουλευτικών Υπηρεσιών AI (Ad-hoc)",
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
