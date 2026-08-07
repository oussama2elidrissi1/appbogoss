import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Gift, XCircle } from 'lucide-react';
import { getErrorMessage, getPortalRewards } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PortalReward } from '@/types/portal';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const } },
};

function rewardLabel(reward: PortalReward): string {
    if (reward.service_name) return reward.service_name;
    if (reward.value !== null) return `${reward.value} MAD`;
    return reward.program_name ?? 'Récompense';
}

function RewardCard({ reward }: { reward: PortalReward }) {
    const isAvailable = reward.status === 'available';
    const isUsed = reward.status === 'used';

    return (
        <Card className="flex items-center gap-3 p-4">
            <span
                className={
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
                    (isAvailable ? 'bg-accent/[0.12]' : isUsed ? 'bg-success/[0.12]' : 'bg-tint/[0.06]')
                }
            >
                {isUsed ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                ) : isAvailable ? (
                    <Gift className="h-5 w-5 text-accent" />
                ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                )}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{rewardLabel(reward)}</p>
                <p className="text-xs text-muted-foreground">
                    {reward.program_name}
                    {reward.expires_at && isAvailable && ` — expire le ${new Date(reward.expires_at).toLocaleDateString('fr-FR')}`}
                    {reward.used_at && isUsed && ` — utilisée le ${new Date(reward.used_at).toLocaleDateString('fr-FR')}`}
                </p>
            </div>
            <Badge variant={isAvailable ? 'accent' : isUsed ? 'success' : 'outline'}>
                {isAvailable ? 'Disponible' : isUsed ? 'Utilisée' : 'Expirée'}
            </Badge>
        </Card>
    );
}

export default function PortalRewards() {
    const rewardsQuery = useQuery({ queryKey: ['portal', 'rewards'], queryFn: getPortalRewards });

    if (rewardsQuery.isPending) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
            </div>
        );
    }

    if (rewardsQuery.isError) {
        return (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-4 py-3">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{getErrorMessage(rewardsQuery.error)}</p>
            </div>
        );
    }

    const { available, used, expired } = rewardsQuery.data;

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
                <h1 className="text-xl font-semibold tracking-tight">Mes récompenses</h1>
                <p className="mt-1 text-sm text-muted-foreground">Présentez-les en caisse pour en profiter.</p>
            </motion.div>

            {available.length === 0 && used.length === 0 && expired.length === 0 ? (
                <motion.div variants={item} className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-6 text-center">
                    <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm text-muted-foreground">Aucune récompense pour le moment.</p>
                </motion.div>
            ) : (
                <>
                    {available.length > 0 && (
                        <motion.div variants={item} className="space-y-2">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponibles</h2>
                            {available.map((reward) => (
                                <RewardCard key={reward.id} reward={reward} />
                            ))}
                        </motion.div>
                    )}
                    {used.length > 0 && (
                        <motion.div variants={item} className="space-y-2">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Utilisées</h2>
                            {used.map((reward) => (
                                <RewardCard key={reward.id} reward={reward} />
                            ))}
                        </motion.div>
                    )}
                    {expired.length > 0 && (
                        <motion.div variants={item} className="space-y-2">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expirées / annulées</h2>
                            {expired.map((reward) => (
                                <RewardCard key={reward.id} reward={reward} />
                            ))}
                        </motion.div>
                    )}
                </>
            )}
        </motion.div>
    );
}
