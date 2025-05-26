// app/dashboard/v0-tester/page.tsx
import { getCurrentUserWorkspaceDetails } from "@/app/actions/database/workspaceActions";
import V0TesterClientContent from "@/components/v0-tester/V0TesterClientContent"; // We will create this next

export default async function V0TesterPage() {
  const workspaceDetails = await getCurrentUserWorkspaceDetails();

  // We might not need promptUsageCount for the v0 tester, 
  // but workspaceId is useful for the scraper part.
  // You can decide if any initial checks like promptUsageCount are relevant here.
  // For now, let's assume no usage limit for this new feature.

  return (
    <V0TesterClientContent
      workspaceId={workspaceDetails.id}
    />
  );
}
