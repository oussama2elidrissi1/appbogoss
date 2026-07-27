import { motion } from 'framer-motion';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PlaceholderPageProps {
    title: string;
    icon: LucideIcon;
    description: string;
}

export default function PlaceholderPage({
    title,
    icon: Icon,
    description,
}: PlaceholderPageProps) {
    return (
        <div className="flex min-h-[70vh] items-center justify-center">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="glass grain relative w-full max-w-md overflow-hidden rounded-lg p-10 text-center shadow-soft-lg"
            >
                {/* Soft accent bloom */}
                <span className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-accent/[0.10] blur-3xl" />

                <div className="relative flex justify-center">
                    <span className="relative flex h-16 w-16 items-center justify-center rounded-lg bg-accent/[0.12] ring-1 ring-accent/20">
                        <Icon className="h-7 w-7 text-accent" />
                        {/* Slow breathing halo */}
                        <motion.span
                            aria-hidden
                            className="absolute inset-0 rounded-lg ring-1 ring-accent/30"
                            animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.28, 1] }}
                            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    </span>
                </div>

                <Badge variant="accent" className="relative mt-6">
                    Bientôt disponible
                </Badge>

                <h2 className="relative mt-4 text-xl font-semibold tracking-tight">{title}</h2>
                <p className="relative mt-2.5 text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>

                <Button asChild variant="outline" className="relative mt-8">
                    <Link to="/dashboard">
                        <ArrowLeft />
                        Retour au dashboard
                    </Link>
                </Button>
            </motion.div>
        </div>
    );
}
