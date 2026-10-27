import { notFound } from "next/navigation";
import TrialTestsCatalog from "../../_components/TrialTestsCatalog";

export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const route = await params;
  let category: string;
  try { category = decodeURIComponent(route.category); }
  catch { notFound(); }
  if (!category.trim() || category.trim().length > 120) notFound();
  return <TrialTestsCatalog key={category} category={category} />;
}
