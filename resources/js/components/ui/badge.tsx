import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-200 [&_svg]:size-3 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'border-white/[0.08] bg-secondary text-secondary-foreground',
                accent: 'border-accent/25 bg-accent/[0.12] text-accent',
                success: 'border-success/25 bg-success/[0.12] text-success',
                destructive: 'border-destructive/25 bg-destructive/[0.12] text-destructive',
                outline: 'border-border text-muted-foreground',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
