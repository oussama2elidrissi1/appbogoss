import { Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shown while a page's code chunk downloads — every page is lazy-loaded (see
 * App.tsx). `fullScreen` for the very first load, before any shell exists;
 * inside a layout it only fills the content area so the sidebar/topbar stay.
 */
export function RouteFallback({ fullScreen = false }: { fullScreen?: boolean }) {
    return (
        <div
            role="status"
            aria-busy="true"
            className={cn(
                'flex items-center justify-center',
                fullScreen ? 'h-screen bg-background' : 'min-h-[40vh]',
            )}
        >
            <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                <Scissors className="h-5 w-5 text-accent" />
            </span>
        </div>
    );
}
