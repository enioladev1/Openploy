import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ServiceDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-4 w-24" />
      <div className="mb-6 flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-6 w-40 rounded-4xl" />
        </div>
        <Skeleton className="h-9 w-24 rounded-4xl" />
      </div>

      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-full max-w-md self-center rounded-full" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
