/**
 * Documented appointment-create commit order (AppointmentsTab save handler).
 *
 * Accepted rollback behavior (partner, no hard-delete):
 * - Failure before any Firestore write: nothing visible.
 * - Failure after task create, before series: canceled tasks may remain (founder hard-deletes).
 * - Failure after series, during link/sync: canceled tasks + canceled appointments (Canceled tab).
 * - task_created notifications fire only after full success (skipNotifications during batch).
 * - Google Calendar sync runs only after full success.
 */
export type AppointmentCreatePhase =
  | "validate"
  | "create_tasks"
  | "create_appointments"
  | "link_tasks"
  | "notify_and_sync";

export const APPOINTMENT_CREATE_PHASES: AppointmentCreatePhase[] = [
  "validate",
  "create_tasks",
  "create_appointments",
  "link_tasks",
  "notify_and_sync",
];

/** True when rollback may leave canceled CRM docs (partner cannot hard-delete). */
export function partnerRollbackMayLeaveCanceledDocs(failedAfterPhase: AppointmentCreatePhase): boolean {
  return (
    failedAfterPhase === "create_tasks" ||
    failedAfterPhase === "create_appointments" ||
    failedAfterPhase === "link_tasks"
  );
}
