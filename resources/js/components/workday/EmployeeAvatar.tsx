import { cn, getInitials } from '@/lib/utils';

const SIZES = {
    sm: 'h-7 w-7 text-[10px]',
    default: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
} as const;

interface EmployeeAvatarProps {
    name: string;
    /** Hex/CSS colour supplied per-employee by the API. */
    color: string;
    size?: keyof typeof SIZES;
    className?: string;
}

/**
 * Initials avatar tinted with the employee's own `avatar_color`. Radix's Avatar
 * primitive is image-first; there are no photos in this module, so this stays a
 * plain span and keeps the per-employee colour as an inline style (the value is
 * dynamic, so it cannot be a Tailwind class).
 */
export function EmployeeAvatar({ name, color, size = 'default', className }: EmployeeAvatarProps) {
    return (
        <span
            aria-hidden
            className={cn(
                'flex shrink-0 items-center justify-center rounded-full font-semibold',
                SIZES[size],
                className,
            )}
            style={{
                backgroundColor: `${color}24`,
                color,
                boxShadow: `inset 0 0 0 1px ${color}40`,
            }}
        >
            {getInitials(name)}
        </span>
    );
}
