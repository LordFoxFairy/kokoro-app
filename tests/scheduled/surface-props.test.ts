import { expect, it } from "vitest";

import type {
  ScheduledTaskClient,
  ScheduledTaskRecord,
  ScheduledTaskSurfaceProps,
} from "@/features/scheduled-tasks";

const client: ScheduledTaskClient = {
  listScheduledTasks: async () => [],
  createScheduledTask: async () => ({
    id: "created",
    title: "Created",
    frequency: "daily",
    time: "08:00",
  }),
  updateScheduledTask: async () => ({
    id: "updated",
    title: "Updated",
    frequency: "daily",
    time: "08:00",
  }),
  retryScheduledTask: async () => ({
    id: "retried",
    title: "Retried",
    frequency: "daily",
    time: "08:00",
  }),
  deleteScheduledTask: async () => ({ ok: true }),
};
const tasks: readonly ScheduledTaskRecord[] = [];

const preview = {
  mode: "preview",
  brandName: "Kokoro",
} satisfies ScheduledTaskSurfaceProps;
const live = {
  mode: "live",
  brandName: "Kokoro",
  scheduledTaskClient: client,
} satisfies ScheduledTaskSurfaceProps;
const controlled = {
  mode: "controlled",
  brandName: "Kokoro",
  tasks,
} satisfies ScheduledTaskSurfaceProps;

// @ts-expect-error preview cannot carry a live client
const previewWithClient = { mode: "preview", scheduledTaskClient: client } satisfies ScheduledTaskSurfaceProps;
// @ts-expect-error controlled state and a live client are mutually exclusive
const controlledWithClient = { mode: "controlled", tasks, scheduledTaskClient: client } satisfies ScheduledTaskSurfaceProps;
// @ts-expect-error live mode requires its complete narrow client
const liveWithoutClient = { mode: "live" } satisfies ScheduledTaskSurfaceProps;

it("models ScheduledTask source selection as a discriminated union", () => {
  expect([preview.mode, live.mode, controlled.mode]).toEqual([
    "preview",
    "live",
    "controlled",
  ]);
  expect([
    previewWithClient.mode,
    controlledWithClient.mode,
    liveWithoutClient.mode,
  ]).toHaveLength(3);
});
