/** Runs before the app shell loads — theme, font scale, and timezone from localStorage. */
import "./index.css";
import { initAppearance } from "./utils/appearance";
import { initTimezone } from "./utils/orgTimezone";

initAppearance();
initTimezone();
