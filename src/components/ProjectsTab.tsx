import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { usePersistedFormDraft } from "../hooks/usePersistedFormDraft";
import { clearFormDraft, isShallowDraftEmpty, readFormDraft } from "../utils/formDraftStorage";
import type { Person, Project, Task } from "../types";
import { TEAM_DEPARTMENTS, departmentChipClass, departmentPickerChipClass } from "../types";
import { isTaskOpen } from "../utils/personTaskStats";
import { orgTodayDateKey } from "../utils/orgTimezone";
import {
  DEFAULT_PROJECT_COLOR,
  PROJECT_COLOR_OPTIONS,
  type ProjectColor,
} from "../utils/projectColors";
import { NewTaskForm, PriorityUrgencyIcon } from "./TasksTab";
import { ConfirmPanel } from "./TaskWorkerActions";
import { MobileDetailBack } from "./MobileDetailBack";
import { useI18n, useT } from "../contexts/I18nContext";
import { translatePriority, translateTaskStatus, translateDepartment } from "../i18n/helpers";

function ProjectDepartmentPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (departments: string[]) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const selected = value.filter((d) => TEAM_DEPARTMENTS.includes(d as (typeof TEAM_DEPARTMENTS)[number]));
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">{t("projects.deptVisibilityHint")}</p>
      <div className="flex flex-wrap gap-1.5">
        {TEAM_DEPARTMENTS.map((dept) => {
          const active = selected.includes(dept);
          return (
            <button
              key={dept}
              type="button"
              onClick={() =>
                onChange(active ? selected.filter((d) => d !== dept) : [...selected, dept])
              }
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                departmentPickerChipClass(dept, active)
              }`}
            >
              {translateDepartment(locale, dept)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectColorPicker({
  value,
  onChange,
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("projects.colorAria")}>
      {PROJECT_COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={t("projects.colorLabel", { color: c })}
          aria-pressed={value === c}
          className={`h-6 w-6 rounded-full border-2 transition ${
            value === c
              ? "border-slate-800 ring-2 ring-slate-400/50 ring-offset-1"
              : "border-slate-200 ring-1 ring-slate-200/70 hover:ring-slate-300"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function SidebarSectionHeader({
  title,
  projectCount,
  taskCount,
  expanded,
  onToggle,
}: {
  title: string;
  projectCount: number;
  taskCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50"
    >
      <span
        className={`inline-block shrink-0 text-[10px] text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        aria-hidden
      >
        ▸
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
      <span className="text-[10px] tabular-nums text-slate-400">
        {projectCount} · {t("common.taskCount", { count: taskCount })}
      </span>
    </button>
  );
}

const PROJECTS_VIEW_DEFAULTS = {
  selectedId: "",
};

const PROJECTS_CREATE_DRAFT_KEY = "projects:create";
const PROJECTS_EDIT_DRAFT_KEY = "projects:edit";
const PROJECTS_TASK_FORM_KEY = "projects:task-form";

type ProjectCreateDraft = {
  name: string;
  desc: string;
  color: ProjectColor;
  departments: string[];
};

type ProjectEditDraft = ProjectCreateDraft;

function isProjectCreateDraftEmpty(draft: ProjectCreateDraft): boolean {
  return isShallowDraftEmpty(draft as unknown as Record<string, unknown>);
}

function projectTaskDraftKey(projectId: string): string {
  return `projects:task:${projectId}`;
}

export function ProjectsTab({
  projects,
  tasks,
  people,
  currentUserId,
  canManageProjects = false,
  onCreateProject,
  onUpdateProject,
  onRemoveProject,
  onAddTask,
  onOpenTask,
}: {
  projects: Project[];
  tasks: Task[];
  people: Person[];
  currentUserId: string;
  canManageProjects?: boolean;
  onCreateProject: (payload: Omit<Project, "id" | "createdAt" | "completed">) => void | Promise<void>;
  onUpdateProject: (id: string, patch: Partial<Project>) => void | Promise<void>;
  onRemoveProject: (id: string) => void | Promise<void>;
  onAddTask: (
    t: Omit<Task, "id" | "createdAt">,
    options?: { taskId?: string }
  ) => void | Promise<string | void>;
  onOpenTask: (taskId: string) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const saved = useMemo(() => readPersistedTabState("projects", PROJECTS_VIEW_DEFAULTS), []);
  const savedCreate = useMemo(() => readFormDraft<ProjectCreateDraft>(PROJECTS_CREATE_DRAFT_KEY), []);
  const savedEdit = useMemo(() => readFormDraft<ProjectEditDraft>(PROJECTS_EDIT_DRAFT_KEY), []);
  const savedTaskForm = useMemo(() => readFormDraft<Record<string, never>>(PROJECTS_TASK_FORM_KEY), []);
  const [selectedId, setSelectedId] = useState(() => {
    if (savedEdit?.editing && savedEdit.editId) return savedEdit.editId;
    if (savedTaskForm?.open && savedTaskForm.editId) return savedTaskForm.editId;
    return saved.selectedId;
  });
  const [showCreate, setShowCreate] = useState(() => Boolean(savedCreate?.open));
  const [showTaskForm, setShowTaskForm] = useState(() => Boolean(savedTaskForm?.open));
  const [editing, setEditing] = useState(() => Boolean(savedEdit?.editing));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draftName, setDraftName] = useState(() => savedEdit?.data.name ?? "");
  const [draftDesc, setDraftDesc] = useState(() => savedEdit?.data.desc ?? "");
  const [createName, setCreateName] = useState(() => savedCreate?.data.name ?? "");
  const [createDesc, setCreateDesc] = useState(() => savedCreate?.data.desc ?? "");
  const [createColor, setCreateColor] = useState<ProjectColor>(
    () => savedCreate?.data.color ?? DEFAULT_PROJECT_COLOR
  );
  const [createDepartments, setCreateDepartments] = useState<string[]>(
    () => savedCreate?.data.departments ?? []
  );
  const [openSectionExpanded, setOpenSectionExpanded] = useState(true);
  const [completeSectionExpanded, setCompleteSectionExpanded] = useState(false);

  usePersistedTabState("projects", { selectedId });

  const createDraftData: ProjectCreateDraft = {
    name: createName,
    desc: createDesc,
    color: createColor,
    departments: createDepartments,
  };

  usePersistedFormDraft(
    PROJECTS_CREATE_DRAFT_KEY,
    { open: showCreate, data: createDraftData },
    { isEmpty: isProjectCreateDraftEmpty }
  );

  const openProjects = useMemo(
    () => [...projects].filter((p) => !p.completed).sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );
  const completedProjects = useMemo(
    () => [...projects].filter((p) => p.completed).sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  const openSectionTaskCount = useMemo(
    () => tasks.filter((t) => t.projectId && openProjects.some((p) => p.id === t.projectId)).length,
    [tasks, openProjects]
  );
  const completeSectionTaskCount = useMemo(
    () => tasks.filter((t) => t.projectId && completedProjects.some((p) => p.id === t.projectId)).length,
    [tasks, completedProjects]
  );

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedId("");
      return;
    }
    if (!projects.some((p) => p.id === selectedId)) {
      setSelectedId(openProjects[0]?.id ?? completedProjects[0]?.id ?? "");
    }
  }, [projects, openProjects, completedProjects, selectedId]);

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? openProjects[0] ?? completedProjects[0],
    [projects, openProjects, completedProjects, selectedId]
  );

  const prevSelectedIdRef = useRef(selectedId);
  useEffect(() => {
    if (prevSelectedIdRef.current === selectedId) return;
    prevSelectedIdRef.current = selectedId;
    setEditing(false);
    setShowTaskForm(false);
  }, [selectedId]);

  const projectTasks = useMemo(() => {
    if (!selected) return [];
    return tasks
      .filter((t) => t.projectId === selected.id)
      .sort((a, b) => {
        const aOpen = isTaskOpen(a) ? 0 : 1;
        const bOpen = isTaskOpen(b) ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, selected]);

  const [draftColor, setDraftColor] = useState<ProjectColor>(
    () => savedEdit?.data.color ?? DEFAULT_PROJECT_COLOR
  );
  const [draftDepartments, setDraftDepartments] = useState<string[]>(
    () => savedEdit?.data.departments ?? []
  );

  const editDraftData: ProjectEditDraft = {
    name: draftName,
    desc: draftDesc,
    color: draftColor,
    departments: draftDepartments,
  };

  usePersistedFormDraft(
    PROJECTS_EDIT_DRAFT_KEY,
    {
      editing,
      editId: editing ? selectedId : undefined,
      data: editDraftData,
    },
    { isEmpty: isProjectCreateDraftEmpty }
  );

  usePersistedFormDraft(
    PROJECTS_TASK_FORM_KEY,
    {
      open: showTaskForm,
      editId: showTaskForm ? selectedId : undefined,
      data: {},
    },
    { isEmpty: () => true }
  );

  function startEdit() {
    if (!selected) return;
    setDraftName(selected.name);
    setDraftDesc(selected.description);
    setDraftColor(selected.color as ProjectColor);
    setDraftDepartments(selected.departmentIds ?? []);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected || !draftName.trim()) return;
    await onUpdateProject(selected.id, {
      name: draftName.trim(),
      description: draftDesc.trim(),
      color: draftColor,
      departmentIds: draftDepartments,
    });
    clearFormDraft(PROJECTS_EDIT_DRAFT_KEY);
    setEditing(false);
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    await onCreateProject({
      name: createName.trim(),
      description: createDesc.trim(),
      color: createColor,
      departmentIds: createDepartments,
    });
    clearFormDraft(PROJECTS_CREATE_DRAFT_KEY);
    setCreateName("");
    setCreateDesc("");
    setCreateColor(DEFAULT_PROJECT_COLOR);
    setCreateDepartments([]);
    setShowCreate(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,300px)_1fr]">
      <aside className={`space-y-3 ${selected ? "hidden lg:block" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-slate-900">{t("projects.title")}</h2>
          {canManageProjects && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
            >
              {showCreate ? t("common.cancel") : t("common.new")}
            </button>
          )}
        </div>

        {canManageProjects && showCreate && (
          <form
            onSubmit={(e) => void handleCreateProject(e)}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("common.name")}</span>
              <input
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="input-base py-2 text-sm"
              />
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("projects.description")}</span>
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                rows={3}
                className="input-base min-h-[72px] resize-y py-2 text-sm"
              />
            </label>
            <div className="mt-2">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("projects.colorAria")}</span>
              <ProjectColorPicker value={createColor} onChange={setCreateColor} />
            </div>
            <div className="mt-2">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("projects.departmentVisibility")}</span>
              <ProjectDepartmentPicker value={createDepartments} onChange={setCreateDepartments} />
            </div>
            <button
              type="submit"
              className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
            >
              {t("common.create")}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {openProjects.length > 0 && (
            <div>
              <SidebarSectionHeader
                title={t("projects.section.open")}
                projectCount={openProjects.length}
                taskCount={openSectionTaskCount}
                expanded={openSectionExpanded}
                onToggle={() => setOpenSectionExpanded((v) => !v)}
              />
              {openSectionExpanded && (
                <ul className="mt-1 space-y-1.5 pl-1">
                  {openProjects.map((p) => {
                    const active = selected?.id === p.id;
                    const taskCount = tasks.filter((t) => t.projectId === p.id).length;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-indigo-300 bg-indigo-50/90 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-slate-900">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: p.color }}
                              aria-hidden
                            />
                            <span className="truncate">{p.name}</span>
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {t("common.taskCount", { count: taskCount })}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {completedProjects.length > 0 && (
            <div>
              <SidebarSectionHeader
                title={t("projects.section.complete")}
                projectCount={completedProjects.length}
                taskCount={completeSectionTaskCount}
                expanded={completeSectionExpanded}
                onToggle={() => setCompleteSectionExpanded((v) => !v)}
              />
              {completeSectionExpanded && (
                <ul className="mt-1 space-y-1.5 pl-1">
                  {completedProjects.map((p) => {
                    const active = selected?.id === p.id;
                    const taskCount = tasks.filter((t) => t.projectId === p.id).length;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition opacity-75 ${
                            active
                              ? "border-indigo-300 bg-indigo-50/90 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-slate-900 line-through">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: p.color }}
                              aria-hidden
                            />
                            <span className="truncate">{p.name}</span>
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {t("common.taskCount", { count: taskCount })}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {projects.length === 0 && !showCreate && (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            {t("projects.empty")}
          </p>
        )}
      </aside>

      {selected ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <MobileDetailBack onBack={() => setSelectedId("")} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">{t("common.name")}</span>
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="input-base"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">{t("projects.description")}</span>
                    <textarea
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      rows={4}
                      className="input-base min-h-[96px] resize-y"
                    />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-600">{t("projects.colorAria")}</span>
                    <ProjectColorPicker value={draftColor} onChange={setDraftColor} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-600">{t("projects.departmentVisibility")}</span>
                    <ProjectDepartmentPicker value={draftDepartments} onChange={setDraftDepartments} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: selected.color }}
                      aria-hidden
                    />
                    <h3 className="font-display text-xl font-semibold text-slate-900">{selected.name}</h3>
                    {selected.completed && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        {t("projects.badge.complete")}
                      </span>
                    )}
                  </div>
                  {selected.description ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{selected.description}</p>
                  ) : null}
                  {(selected.departmentIds?.length ?? 0) > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selected.departmentIds!.map((d) => (
                        <span
                          key={d}
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${departmentChipClass(d)}`}
                        >
                          {translateDepartment(locale, d)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">{t("projects.orgWideHint")}</p>
                  )}
                </>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
                  >
                    {t("common.save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : canManageProjects ? (
                <>
                  {!selected.completed ? (
                    <button
                      type="button"
                      onClick={() => void Promise.resolve(onUpdateProject(selected.id, { completed: true }))}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      {t("common.markComplete")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void Promise.resolve(onUpdateProject(selected.id, { completed: false }))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {t("common.reopen")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t("common.edit")}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {editing && canManageProjects && (
            deleteConfirmOpen ? (
              <div className="mt-4">
                <ConfirmPanel
                  message={t("projects.deleteConfirm", { name: selected.name })}
                  yesLabel={t("projects.yesDelete")}
                  noLabel={t("projects.keepProject")}
                  yesEmphasis
                  onYes={() => {
                    void Promise.resolve(onRemoveProject(selected.id));
                    setEditing(false);
                    setDeleteConfirmOpen(false);
                  }}
                  onNo={() => setDeleteConfirmOpen(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="mt-4 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                {t("common.delete")}
              </button>
            )
          )}

          <div className="mt-6 border-t border-slate-100 pt-4">
            {showTaskForm ? (
              <NewTaskForm
                people={people}
                projects={projects}
                currentUserId={currentUserId}
                defaultProjectId={selected.id}
                lockProject
                draftKey={projectTaskDraftKey(selected.id)}
                formOpen={showTaskForm}
                onSubmit={async (payload, { taskId }) => {
                  await onAddTask(payload, { taskId });
                  clearFormDraft(projectTaskDraftKey(selected.id));
                  clearFormDraft(PROJECTS_TASK_FORM_KEY);
                  setShowTaskForm(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowTaskForm(true)}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
              >
                {t("projects.newTask")}
              </button>
            )}

            {projectTasks.length > 0 && (
              <ul className="mt-3 space-y-2">
                {projectTasks.map((task) => {
                  const today = orgTodayDateKey();
                  const overdue = isTaskOpen(task) && task.dueDate < today;
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-medium text-slate-900">{task.title}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                            <PriorityUrgencyIcon priority={task.priority} className="h-3.5 w-3.5" />
                            {translatePriority(locale, task.priority)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          <span>{translateTaskStatus(locale, task.status)}</span>
                          <span className={overdue ? "font-semibold text-rose-600" : ""}>
                            {t("common.duePrefix", { date: task.dueDate })}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <div className="glass-strong hidden min-h-[320px] items-center justify-center rounded-3xl p-8 text-center text-slate-500 lg:flex">
          —
        </div>
      )}
    </div>
  );
}
