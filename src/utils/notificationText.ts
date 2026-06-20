import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";
import type { AppNotification } from "../types";

export function notificationHeadline(n: AppNotification): string {
  const locale = loadLocale();
  const who = n.authorName || translate(locale, "notifications.line.someone");
  switch (n.kind) {
    case "mention_person":
      return translate(locale, "notifications.mentionPerson", { who });
    case "mention_department":
      return translate(locale, "notifications.mentionDept", {
        who,
        label: n.mentionLabel || translate(locale, "notifications.line.team"),
      });
    case "mention_update":
      return translate(locale, "notifications.mentionUpdate", {
        who,
        label: n.mentionLabel || translate(locale, "notifications.line.anUpdate"),
      });
    case "task_feedback":
      return translate(locale, "notifications.feedbackRequest", { who });
    case "task_feedback_reply":
      return translate(locale, "notifications.feedbackReply", { who });
    case "task_finished":
      if (n.mentionLabel === "assigner") {
        return translate(locale, "notifications.taskFinishedAssigner", { who });
      }
      if (n.mentionLabel === "worker") {
        return translate(locale, "notifications.taskFinishedWorker", { who });
      }
      return translate(locale, "notifications.taskFinishedGeneric", { who });
    case "task_postponed":
      return translate(locale, "notifications.taskPostponed", { who });
    case "task_created":
      return translate(locale, "notifications.taskCreated", { who });
    case "task_marked_complete":
      return translate(locale, "notifications.taskMarkedComplete", { who });
    case "task_reopened":
      return translate(locale, "notifications.taskReopened", { who });
    case "comment_reaction":
      return n.mentionLabel === "dislike"
        ? translate(locale, "notifications.commentDisliked", { who })
        : translate(locale, "notifications.commentLiked", { who });
    case "reminder_shared":
      return translate(locale, "notifications.reminderShared", { who });
    case "reminder_due":
      return n.mentionLabel
        ? translate(locale, "notifications.reminderDue", { label: n.mentionLabel })
        : translate(locale, "notifications.reminderUpcoming");
    case "member_joined":
      return translate(locale, "notifications.memberJoined", {
        name: n.taskTitle.trim() || n.authorName || translate(locale, "data.member.newTeammate"),
      });
    case "chat_message":
      return translate(locale, "notifications.chatMessage", { who });
    case "appointment_rsvp":
      return translate(locale, "notifications.appointmentRsvp");
    case "task_comment":
    default:
      return translate(locale, "notifications.taskComment", { who });
  }
}

export function notificationTaskLine(n: AppNotification): string {
  const locale = loadLocale();
  if (n.kind === "member_joined") {
    const welcome = translate(locale, "data.member.joinWelcome");
    const preview = n.bodyPreview.trim();
    if (!preview) return welcome;
    const parts = preview.split("·").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return `${welcome} · ${parts.slice(1).join(" · ")}`;
    }
    return `${welcome} · ${preview}`;
  }
  if (n.kind === "chat_message") {
    return n.taskTitle.trim() || translate(locale, "notifications.line.conversation");
  }
  if (n.kind === "appointment_rsvp") {
    return n.mentionLabel?.trim() || n.taskTitle.trim() || translate(locale, "appointments.untitled");
  }
  return n.taskTitle.trim() || translate(locale, "common.untitledTask");
}
