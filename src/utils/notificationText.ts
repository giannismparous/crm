import type { AppNotification } from "../types";

export function notificationHeadline(n: AppNotification): string {
  const who = n.authorName || "Someone";
  switch (n.kind) {
    case "mention_person":
      return `${who} tagged you by name`;
    case "mention_department":
      return `${who} tagged your department (${n.mentionLabel || "team"})`;
    case "task_feedback":
      return `${who} requested feedback`;
    case "task_feedback_reply":
      return `${who} gave feedback`;
    case "task_finished":
      if (n.mentionLabel === "assigner") return `${who} finished your task`;
      if (n.mentionLabel === "worker") return `${who} finished on a task you're on`;
      return `${who} marked work finished`;
    case "task_postponed":
      return `${who} postponed the due date`;
    case "task_created":
      return `${who} created a task`;
    case "task_marked_complete":
      return `${who} marked a task complete`;
    case "task_reopened":
      return `${who} reopened a task`;
    case "comment_reaction":
      return n.mentionLabel === "dislike" ? `${who} disliked a comment` : `${who} liked a comment`;
    case "task_comment":
    default:
      return `${who} commented on your task`;
  }
}

export function notificationTaskLine(n: AppNotification): string {
  return n.taskTitle.trim() || "Untitled task";
}
