"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HistoryIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/app/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata || Object.keys(metadata).length === 0) return "";
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(", ");
}

export function AuditLogPanel() {
  const [page, setPage] = useState(1);
  const list = trpc.auditLog.list.useQuery({ page }, { refetchInterval: 10000, placeholderData: (prev) => prev });

  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">Every sensitive action taken on this installation.</p>
      </CardHeader>
      <CardContent>
        {!list.data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : list.data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={HistoryIcon} size={20} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>Sensitive actions - user changes, credential reveals, deletions - will show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table aria-label="Audit log">
              <TableHeader>
                <TableHead isRowHeader>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableHeader>
              <TableBody>
                {list.data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {entry.actorName ? (
                        <div>
                          <p className="text-sm font-medium">{entry.actorName}</p>
                          <p className="text-xs text-muted-foreground">{entry.actorEmail}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unknown user</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.targetType}
                      {entry.targetId && ` (${entry.targetId.slice(0, 8)})`}
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      <span className="block truncate" title={formatMetadata(entry.metadata)}>
                        {formatMetadata(entry.metadata)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {list.data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {list.data.page} of {list.data.totalPages} - {list.data.totalCount} total
                </p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={page <= 1}
                        onPress={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={page >= list.data.totalPages}
                        onPress={() => setPage((p) => Math.min(list.data!.totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
