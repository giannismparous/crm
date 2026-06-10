import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./config";
import type { TaskUpdateTitleContext } from "../utils/taskUpdateTitle";
import { fallbackTaskUpdateTitle, resolveTaskUpdateTitle } from "../utils/taskUpdateTitle";

function functions() {
  return getFunctions(getFirebaseApp(), "us-central1");
}

export async function requestTaskUpdateTitle(context: TaskUpdateTitleContext): Promise<string> {
  const body = context.newUpdateBody.trim();
  if (!body) return "Media update";

  try {
    const fn = httpsCallable<TaskUpdateTitleContext, { title: string }>(
      functions(),
      "generateTaskUpdateTitle"
    );
    const result = await fn(context);
    return resolveTaskUpdateTitle(body, result.data.title);
  } catch (err) {
    console.warn("generateTaskUpdateTitle failed, using fallback:", err);
    return fallbackTaskUpdateTitle(body);
  }
}
