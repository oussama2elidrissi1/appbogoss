import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            'fixed inset-0 z-50 bg-scrim/70 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            className,
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'fixed left-1/2 top-1/2 z-50 flex w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col',
                // Le fond du probleme : une modale plus haute que la fenetre
                // debordait en haut ET en bas, sans aucun moyen d'atteindre
                // ses boutons — elle est centree par translation, donc rien ne
                // defilait. Elle est desormais bornee a la hauteur visible et
                // defile a l'interieur.
                //
                // `dvh` et non `vh` : sur telephone, la barre d'adresse se
                // retracte, et `vh` fige la hauteur du navigateur deplie.
                //
                // Les modales qui posaient deja leur propre `max-h-[90vh]`
                // continuent de le faire : `cn` laisse la classe de l'appelant
                // l'emporter. Ce garde-fou n'existe que pour toutes les
                // autres, qui n'y avaient pas pense.
                'max-h-[calc(100dvh-2rem)]',
                'edge-light rounded-lg border border-tint/[0.08] bg-card shadow-soft-lg',
                'duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                className,
            )}
            {...props}
        >
            {/* Le defilement vit ici et non sur le cadre : le bouton de
                fermeture, positionne sur le cadre, reste ainsi atteignable
                quel que soit l'endroit ou l'on se trouve dans le contenu.
                `min-h-0` est indispensable — sans lui, un enfant de colonne
                flex refuse de retrecir sous la taille de son contenu, et rien
                ne defile. */}
            <div className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-6">
                {children}
            </div>
            <DialogPrimitive.Close
                className={cn(
                    'absolute right-4 top-4 rounded-sm p-1 text-muted-foreground opacity-70 transition-all duration-200',
                    'hover:bg-tint/[0.06] hover:text-foreground hover:opacity-100',
                    'focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:pointer-events-none',
                )}
            >
                <X className="h-4 w-4" />
                <span className="sr-only">Fermer</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
            {...props}
        />
    );
}

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn('text-sm text-muted-foreground', className)}
        {...props}
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
