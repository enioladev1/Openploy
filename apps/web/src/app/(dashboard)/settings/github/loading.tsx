import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function GithubSettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-7 w-20" />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-9 w-48 rounded-4xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  );
}
