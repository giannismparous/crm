import type { Person } from "../types";

/** True when a newly registered user still needs the post-signup profile screen. */
export function needsProfileSetup(person: Person | undefined): boolean {
  return person?.profileSetupComplete === false;
}
