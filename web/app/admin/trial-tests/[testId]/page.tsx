import { notFound } from "next/navigation";
import TrialTestWorkspace from "../_components/TrialTestWorkspace";

export default async function Page({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const id = Number(testId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <TrialTestWorkspace key={id} testId={id} />;
}
