import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-md bg-tint/[0.05]',
                'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
                'after:bg-gradient-to-r after:from-transparent after:via-tint/[0.06] after:to-transparent',
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
