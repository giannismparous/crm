import { createContext, useContext, type ReactNode } from "react";

const PersonNavContext = createContext<((personId: string) => void) | null>(null);

export function PersonNavProvider({
  onOpenTeamMember,
  children,
}: {
  onOpenTeamMember: (personId: string) => void;
  children: ReactNode;
}) {
  return <PersonNavContext.Provider value={onOpenTeamMember}>{children}</PersonNavContext.Provider>;
}

export function useOpenTeamMember(): ((personId: string) => void) | null {
  return useContext(PersonNavContext);
}
