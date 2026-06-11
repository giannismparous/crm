import { commonEn } from "./common";
import { appEn } from "./app";
import { tasksEn } from "./tasks";
import { featuresEn } from "./features";
import { systemEn } from "./system";

export const en: Record<string, string> = {
  ...commonEn,
  ...appEn,
  ...tasksEn,
  ...featuresEn,
  ...systemEn,
};
