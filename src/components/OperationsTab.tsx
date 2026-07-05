import type { Person } from "../types";
import { useOpenTeamMember } from "../contexts/PersonNavContext";
import { OperationsOrgChart } from "./operations/OperationsOrgChart";

export function OperationsTab({ people }: { people: Person[] }) {
  const openTeamMember = useOpenTeamMember();

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <OperationsOrgChart
        people={people}
        onOpenPerson={(personId) => openTeamMember?.(personId)}
      />
    </div>
  );
}
