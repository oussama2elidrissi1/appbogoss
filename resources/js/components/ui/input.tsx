import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                ref={ref}
                className={cn(
                    'flex h-11 w-full rounded-md border border-input bg-white/[0.03] px-3.5 py-2 text-sm text-foreground shadow-sm transition-all duration-200',
                    'placeholder:text-muted-foreground/70',
                    'hover:border-white/20',
                    'focus-visible:border-accent/60 focus-visible:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                    className,
                )}
                {...props}
            />
        );
    },
);
Input.displayName = 'Input';

export { Input };
