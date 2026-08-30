import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BackupsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-7 w-28" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-2xl" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="flex max-w-lg flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-9 w-full rounded-2xl" />
          <Skeleton className="h-9 w-full rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  );
}
