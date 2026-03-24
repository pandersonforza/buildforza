"use client";

import { useParams } from "next/navigation";
import { MilestonesPanel } from "@/components/milestones/milestones-panel";

export default function MilestonesPage() {
  const params = useParams();
  const projectId = params.id as string;

  return <MilestonesPanel projectId={projectId} />;
}
