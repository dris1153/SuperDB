import { redirect } from "next/navigation";

/** The original opens Database on the Schema Visualizer. */
export default async function DatabasePage({ params }: { params: Promise<{ ref: string }> }) {
  redirect(`/p/${(await params).ref}/database/schemas`);
}
