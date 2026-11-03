"use client";

import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/i18n/context";

import type { ScheduledTaskRecord } from "../model/scheduled-task";
import { ScheduledTaskRunUpdates } from "./scheduled-task-run-updates";
import { ScheduledTaskContent } from "./scheduled-task-content";
import { ScheduledTaskDialogs } from "./scheduled-task-dialogs";
import { ScheduledTaskAutomationWorkflow } from "./scheduled-task-automation-workflow";
import {
  useScheduledLocation,
  scheduledProjectReturnHref,
  scheduledTaskCreationContextKey,
  type ScheduledLocationState,
  type ScheduledTaskCreationContext,
  type ScheduledView,
  writeScheduledView,
} from "./scheduled-task-location";
import { resolveScheduledTaskRuntime, type ScheduledTaskRuntime } from "./scheduled-task-mode";
import { scheduledTaskCapabilities } from "./scheduled-task-operations";
import type { ScheduledTaskSurfaceHostProps } from "./scheduled-task-surface.types";
import { useScheduledTaskCalendar } from "./use-scheduled-task-calendar";
import { useScheduledTaskEditor } from "./use-scheduled-task-editor";
import { useScheduledTaskMutations } from "./use-scheduled-task-mutations";
import { useScheduledTaskSource } from "./use-scheduled-task-source";
import styles from "./scheduled-task-surface.module.css";

/**
 * Hosts may use the explicit preview/live/controlled modes or the legacy host
 * shape while routes migrate. `resolveScheduledTaskRuntime` rejects ambiguous
 * combinations before any browser state is read.
 */
export function ScheduledTaskSurface(
  props: ScheduledTaskSurfaceHostProps = {},
) {
  const location = useScheduledLocation();
  const [clientIdentity, setClientIdentity] = useState({ client: props.scheduledTaskClient, version: 0 });
  if (clientIdentity.client !== props.scheduledTaskClient) setClientIdentity({ client: props.scheduledTaskClient, version: clientIdentity.version + 1 });
  const identity = props.preview || props.mode === "preview" ? "preview" : props.projectReadBoundary?.subject ?? null;
  return <ScopedScheduledTaskSurface key={JSON.stringify([props.mode, identity, scheduledTaskCreationContextKey(location.creationContext)])} host={props} location={location} clientVersion={clientIdentity.version} />;
}

function ScopedScheduledTaskSurface({ host: props, location, clientVersion }: { host: ScheduledTaskSurfaceHostProps; location: ScheduledLocationState; clientVersion: number }) {
  const { view, editorOpen, creationContext } = location;
  const resolved = resolveScheduledTaskRuntime(props);
  const boundary = resolved.mode === "live" ? props.projectReadBoundary : undefined;
  const runtime = resolved.mode === "live" && boundary && !boundary.admitted ? { ...resolved, client: null } : resolved;
  const source = useScheduledTaskSource({ runtime, boundary, creationContext });
  const calendar = useScheduledTaskCalendar(source.displayedTasks, runtime.displayTimezone);
  const editor = useScheduledTaskEditor({
    runtime,
    tasks: source.displayedTasks,
    editorOpen,
    creationContext,
    reload: source.loadTasks,
  });
  const mutations = useScheduledTaskMutations(runtime, source.loadTasks);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskRecord | null>(
    null,
  );
  const { removeTask } = mutations;
  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) return;
    if (await removeTask(deleteTarget)) setDeleteTarget(null);
  }, [deleteTarget, removeTask]);

  const switchView = useCallback((next: string) => {
    if (next === "calendar" || next === "list" || next === "updates") writeScheduledView(next);
  }, []);

  if (location.automationWorkflow) return (
    <div className={styles.surface} data-testid="scheduled-surface">
      <ScheduledTaskAutomationWorkflow
        key={JSON.stringify([boundary?.admitted ?? true, boundary?.generation ?? null])}
        runtime={runtime}
        context={creationContext}
        reload={source.loadTasks}
      />
    </div>
  );

  return <ScheduledTaskManagementView
    runsScopeKey={JSON.stringify([clientVersion, boundary?.admitted, boundary?.generation])}
    runtime={runtime}
    creationContext={creationContext}
    view={view}
    editorOpen={editorOpen}
    source={source}
    calendar={calendar}
    editor={editor}
    mutations={mutations}
    deleteTarget={deleteTarget}
    setDeleteTarget={setDeleteTarget}
    confirmDelete={confirmDelete}
    switchView={switchView}
  />;
}

type ScheduledTaskManagementViewProps = Readonly<{
  runtime: ScheduledTaskRuntime;
  runsScopeKey: string;
  creationContext: ScheduledTaskCreationContext;
  view: ScheduledView;
  editorOpen: boolean;
  source: ReturnType<typeof useScheduledTaskSource>;
  calendar: ReturnType<typeof useScheduledTaskCalendar>;
  editor: ReturnType<typeof useScheduledTaskEditor>;
  mutations: ReturnType<typeof useScheduledTaskMutations>;
  deleteTarget: ScheduledTaskRecord | null;
  setDeleteTarget: Dispatch<SetStateAction<ScheduledTaskRecord | null>>;
  confirmDelete: () => Promise<void>;
  switchView: (next: string) => void;
}>;

/** Management presentation consumes the existing scoped hooks without owning a second editor. */
function ScheduledTaskManagementView({ runsScopeKey, runtime, creationContext, view, editorOpen, source, calendar, editor, mutations, deleteTarget, setDeleteTarget, confirmDelete, switchView }: ScheduledTaskManagementViewProps) {
  const { t } = useLocale();
  const { displayedTasks, loading, loadError, loadTasks } = source;
  const { calendarMonth, calendarTasks, resetCalendarMonth, shiftCalendarMonth } = calendar;
  const { pendingMutation, mutationError, mutationBusy, retryTask, setTaskEnabled } = mutations;
  const capabilities = scheduledTaskCapabilities(runtime);
  const content = (
    <>
    <Tabs value={view} onValueChange={switchView} className={styles.managementViews}>
      <TabsList className={styles.sharedViews} variant="line" aria-label={t("rail.navScheduled")}>
        <TabsTrigger value="calendar" onClick={() => switchView("calendar")}>{t("scheduled.tabCalendar")}</TabsTrigger>
        <TabsTrigger value="list" onClick={() => switchView("list")}>{t("scheduled.tabTasks")}</TabsTrigger>
        <TabsTrigger value="updates" onClick={() => switchView("updates")}>{t("scheduled.tabUpdates")}</TabsTrigger>
      </TabsList>
    <TabsContent value={view} className={styles.viewPanel}>
    {view === "updates" ? <ScheduledTaskRunUpdates key={runsScopeKey} readReady={source.readReady} runtime={runtime} context={creationContext} tasks={displayedTasks} loading={loading} loadError={loadError} reloadTasks={loadTasks} /> : <ScheduledTaskContent
      creationContext={creationContext}
      brandName={runtime.brandName}
      fixtureMode={runtime.mode === "preview"}
      controlledTasks={runtime.mode === "controlled"}
      loading={loading}
      loadError={loadError}
      displayedTasks={displayedTasks}
      view={view}
      displayTimezone={runtime.displayTimezone}
      calendarMonth={calendarMonth}
      calendarTasks={calendarTasks}
      pendingMutation={pendingMutation}
      mutationError={mutationError}
      mutationBusy={mutationBusy}
      canCreate={capabilities.canCreate && creationContext.kind !== "invalid"}
      canUpdate={capabilities.canUpdate}
      canRetry={capabilities.canRetry}
      canDelete={capabilities.canDelete}
      loadTasks={loadTasks}
      openEditor={editor.openEditor}
      shiftCalendarMonth={shiftCalendarMonth}
      resetCalendarMonth={resetCalendarMonth}
      setDeleteTarget={setDeleteTarget}
      retryTask={retryTask}
      setTaskEnabled={setTaskEnabled}
    />}
    </TabsContent>
    </Tabs>
    </>
  );

  return (
    <ScheduledTaskScopeFrame context={creationContext} content={content}>
      <ScheduledTaskDialogs
        brandName={runtime.brandName}
        editorOpen={editorOpen}
        onEditorOpenChange={editor.handleOpenChange}
        initialPrompt={editor.initialPrompt}
        {...(editor.pendingCreate ? { pendingCreate: editor.pendingCreate } : {})}
        editingTask={editor.editingTask}
        canSave={editor.canSave && creationContext.kind !== "invalid"}
        onSave={editor.saveTask}
        editorInstanceKey={editor.editorInstanceKey}
        creationContext={creationContext}
        returnFocusRef={editor.openerRef}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleting={pendingMutation?.operation === "delete"}
        canDelete={capabilities.canDelete}
        deleteError={mutationError?.operation === "delete"}
        onDelete={confirmDelete}
      />
    </ScheduledTaskScopeFrame>
  );
}

type ScheduledTaskScopeFrameProps = Readonly<{
  context: ScheduledTaskCreationContext;
  content: ReactNode;
  children: ReactNode;
}>;

function ScheduledTaskScopeFrame({ context, content, children }: ScheduledTaskScopeFrameProps) {
  const { t } = useLocale();
  const returnHref = scheduledProjectReturnHref(context);
  return (
    <div className={styles.surface} data-testid="scheduled-surface">
      <header className={styles.header}>
        <h1>{t("scheduled.title")}</h1>
      </header>
      {(
        <div className={styles.scopedMain}>
          {context.kind === "project" ? (
            <div className={styles.scopeNotice}>
              <p>{t("scheduled.projectScope")}</p>
              {returnHref ? <a href={returnHref}>{t("scheduled.returnToProject")}</a> : null}
            </div>
          ) : null}
          {content}
        </div>
      )}
      {children}
    </div>
  );
}
