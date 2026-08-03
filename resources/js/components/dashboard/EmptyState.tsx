import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center rounded-md border border-dashed border-tint/[0.08] px-6 py-10 text-center',
                className,
            )}
        >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-tint/[0.04]">
                <Icon className="h-5 w-5 text-muted-foreground/70" />
            </span>
            <p className="mt-3.5 text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 max-w-[30ch] text-xs leading-relaxed text-muted-foreground">
                {description}
            </p>
        </div>
    );
}
