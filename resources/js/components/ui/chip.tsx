import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tappable selection chip — the building block for the checkout's employee,
 * category and prestation pickers. Big touch targets on purpose: this is the
 * screen the salon staff use all day.
 *
 * Renders a real `<button>` with `aria-pressed`, so a row of these behaves like
 * a radio group for assistive tech without pulling in another Radix package.
 */
const chipVariants = cva(
    [
        'group relative inline-flex select-none items-center justify-center gap-2 rounded-md border text-sm font-medium',
        'transition-all duration-200 ease-out active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    ].join(' '),
    {
        variants: {
            selected: {
                true: 'border-accent/60 bg-accent/[0.14] text-foreground shadow-glow',
                false: 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:bg-tint/[0.06] hover:text-foreground',
            },
            size: {
                default: 'h-11 px-4 [&_svg]:size-4',
                sm: 'h-9 px-3 text-xs [&_svg]:size-3.5',
                lg: 'h-[72px] flex-col gap-1.5 px-4 [&_svg]:size-5',
            },
        },
        defaultVariants: {
            selected: false,
            size: 'default',
        },
    },
);

export interface ChipProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>,
        VariantProps<typeof chipVariants> {
    selected?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
    ({ className, selected = false, size, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            aria-pressed={selected}
            className={cn(chipVariants({ selected, size, className }))}
            {...props}
        />
    ),
);
Chip.displayName = 'Chip';

export { Chip, chipVariants };
