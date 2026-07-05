import { createContext, useContext } from "react";
import type { Person } from "../../types";

type OrgChartPeopleContextValue = {
  people: Person[];
  currentUserId: string;
  onOpenPerson: (personId: string) => void;
};

const OrgChartPeopleContext = createContext<OrgChartPeopleContextValue>({
  people: [],
  currentUserId: "",
  onOpenPerson: () => {},
});

export function OrgChartPeopleProvider({
  people,
  currentUserId,
  onOpenPerson,
  children,
}: {
  people: Person[];
  currentUserId: string;
  onOpenPerson: (personId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <OrgChartPeopleContext.Provider value={{ people, currentUserId, onOpenPerson }}>
      {children}
    </OrgChartPeopleContext.Provider>
  );
}

export function useOrgChartPeople(): OrgChartPeopleContextValue {
  return useContext(OrgChartPeopleContext);
}

export function useOrgChartIsYou(person?: Pick<Person, "id">): boolean {
  const { currentUserId } = useOrgChartPeople();
  return Boolean(person?.id && currentUserId && person.id === currentUserId);
}
