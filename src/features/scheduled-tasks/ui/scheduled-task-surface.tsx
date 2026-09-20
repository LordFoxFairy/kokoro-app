"use client";

import { useCallback, useState } from "react";

import { useLocale } from "@/i18n/context";

import type { ScheduledTaskRecord } from "../model/scheduled-task";
import { ScheduledTaskContent } from "./scheduled-task-content";
import { ScheduledTaskDialogs } from "./scheduled-task-dialogs";
import {
  useScheduledLocation,
  writeScheduledView,
} from "./scheduled-task-location";
import { resolveScheduledTaskRuntime } from "./scheduled-task-mode";
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
  const { t } = useLocale();
  const runtime = resolveScheduledTaskRuntime(props);
  const { displayedTasks, loading, loadError, loadTasks } =
    useScheduledTaskSource(runtime);
  const { view, editorOpen } = useScheduledLocation();
  const {
    calendarMonth,
    calendarTasks,
    resetCalendarMonth,
    shiftCalendarMonth,
  } = useScheduledTaskCalendar(displayedTasks, runtime.displayTimezone);
  const editor = useScheduledTaskEditor({
    runtime,
    tasks: displayedTasks,
    editorOpen,
    reload: loadTasks,
  });
  const {
    pendingMutation,
    mutationError,
    mutationBusy,
    removeTask,
    retryTask,
    setTaskEnabled,
  } = useScheduledTaskMutations(runtime, loadTasks);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskRecord | null>(
    null,
  );
  const capabilities = scheduledTaskCapabilities(runtime);

  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) return;
    if (await removeTask(deleteTarget)) setDeleteTarget(null);
  }, [deleteTarget, removeTask]);

  const switchView = useCallback((next: string) => {
    if (next === "calendar" || next === "list") writeScheduledView(next);
  }, []);

  return (
    <div className={styles.surface} data-testid="scheduled-surface">
      <header className={styles.header}>
        <h1>{t("rail.navScheduled")}</h1>
      </header>
      <ScheduledTaskContent
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
        canCreate={capabilities.canCreate}
        canUpdate={capabilities.canUpdate}
        canRetry={capabilities.canRetry}
        canDelete={capabilities.canDelete}
        loadTasks={loadTasks}
        openEditor={editor.openEditor}
        switchView={switchView}
        shiftCalendarMonth={shiftCalendarMonth}
        resetCalendarMonth={resetCalendarMonth}
        setDeleteTarget={setDeleteTarget}
        retryTask={retryTask}
        setTaskEnabled={setTaskEnabled}
      />
      <ScheduledTaskDialogs
        brandName={runtime.brandName}
        editorOpen={editorOpen}
        onEditorOpenChange={editor.handleOpenChange}
        initialPrompt={editor.initialPrompt}
        editingTask={editor.editingTask}
        canSave={editor.canSave}
        onSave={editor.saveTask}
        returnFocusRef={editor.openerRef}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleting={pendingMutation?.operation === "delete"}
        deleteError={mutationError?.operation === "delete"}
        onDelete={confirmDelete}
      />
    </div>
  );
}
