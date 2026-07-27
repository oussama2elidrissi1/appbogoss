import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the real dashboard grid so there is no layout shift when data lands. */
export function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div>
                <Skeleton className="h-7 w-56" />
                <Skeleton className="mt-2.5 h-4 w-72" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, index) => (
                    <Card key={index} className="p-5">
                        <div className="flex items-start justify-between">
                            <Skeleton className="h-10 w-10 rounded-md" />
                            <Skeleton className="h-5 w-14 rounded-full" />
                        </div>
                        <Skeleton className="mt-4 h-3 w-24" />
                        <Skeleton className="mt-2.5 h-7 w-28" />
                        <Skeleton className="mt-2.5 h-3 w-20" />
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                    <Card className="p-6">
                        <Skeleton className="h-5 w-64" />
                        <Skeleton className="mt-2.5 h-4 w-48" />
                        <Skeleton className="mt-6 h-[280px] w-full rounded-md" />
                    </Card>

                    <Card className="p-6">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-2.5 h-4 w-56" />
                        <div className="mt-6 space-y-5">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="flex gap-3.5">
                                    <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-2/5" />
                                        <Skeleton className="h-3 w-3/5" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="space-y-6">
                    {Array.from({ length: 2 }).map((_, cardIndex) => (
                        <Card key={cardIndex} className="p-6">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="mt-2.5 h-4 w-44" />
                            <div className="mt-6 space-y-4">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="space-y-2">
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
