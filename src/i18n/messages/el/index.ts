import { commonEl } from "./common";
import { appEl } from "./app";
import { tasksEl } from "./tasks";
import { featuresEl } from "./features";
import { systemEl } from "./system";

export const el: Record<string, string> = {
  ...commonEl,
  ...appEl,
  ...tasksEl,
  ...featuresEl,
  ...systemEl,
};
