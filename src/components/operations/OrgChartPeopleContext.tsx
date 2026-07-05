import { createContext, useContext } from "react";
import type { Person } from "../../types";

type OrgChartPeopleContextValue = {
  people: Person[];
  onOpenPerson: (personId: string) => void;
};

const OrgChartPeopleContext = createContext<OrgChartPeopleContextValue>({
  people: [],
  onOpenPerson: () => {},
});

export function OrgChartPeopleProvider({
  people,
  onOpenPerson,
  children,
}: {
  people: Person[];
  onOpenPerson: (personId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <OrgChartPeopleContext.Provider value={{ people, onOpenPerson }}>
      {children}
    </OrgChartPeopleContext.Provider>
  );
}

export function useOrgChartPeople(): OrgChartPeopleContextValue {
  return useContext(OrgChartPeopleContext);
}
