import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useT } from "../../contexts/I18nContext";
import { ContentLoadingPanel } from "../ContentLoadingPanel";
import { OrgChartPeopleProvider } from "./OrgChartPeopleContext";
import { OrgChartNode, type OrgChartNodeData } from "./OrgChartNode";
import { ORG_CHART_EDGES, ORG_CHART_LAYOUT_EDGES, ORG_CHART_NODES } from "./orgChartData";
import { layoutOrgChart } from "./orgChartLayout";
import type { Person } from "../../types";

const nodeTypes = { orgChart: OrgChartNode };

function OperationsOrgChartCanvas() {
  const { fitView } = useReactFlow();
  const initial = useMemo(
    () => layoutOrgChart(structuredClone(ORG_CHART_NODES), ORG_CHART_LAYOUT_EDGES),
    []
  );
  const [nodes, , onNodesChange] = useNodesState<Node<OrgChartNodeData>>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    setEdges(ORG_CHART_EDGES);
  }, [setEdges]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 480 });
    });
    return () => window.cancelAnimationFrame(id);
  }, [fitView, nodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      panOnScroll
      zoomOnScroll
      minZoom={0.25}
      maxZoom={1.75}
      defaultEdgeOptions={{
        type: "smoothstep",
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="#e2e8f0" />
      <Controls showInteractive={false} className="!rounded-lg !border-slate-200 !shadow-sm" />
    </ReactFlow>
  );
}

export function OperationsOrgChart({
  people,
  currentUserId,
  onOpenPerson,
}: {
  people: Person[];
  currentUserId: string;
  onOpenPerson: (personId: string) => void;
}) {
  const t = useT();
  const peopleReady = people.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-900">{t("operations.orgChartTitle")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("operations.orgChartSubtitle")}</p>
      </div>
      <div className="relative h-[min(72vh,42rem)] min-h-[20rem] overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm">
        {!peopleReady ? (
          <ContentLoadingPanel className="h-full rounded-none border-0 bg-slate-50/90 shadow-none" minHeightClass="h-full" />
        ) : (
          <div className="content-fade-in h-full">
            <OrgChartPeopleProvider people={people} currentUserId={currentUserId} onOpenPerson={onOpenPerson}>
              <ReactFlowProvider>
                <OperationsOrgChartCanvas />
              </ReactFlowProvider>
            </OrgChartPeopleProvider>
          </div>
        )}
      </div>
    </div>
  );
}
