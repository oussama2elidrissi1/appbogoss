import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BadgeCheck, ChevronDown, Gift, HandCoins, Loader2, Star } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { pos2Keys, recordPos2SubscriptionPayment } from '@/lib/pos2Api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Pos2ClientContext as ContextData, Pos2SubscriptionInfo, Pos2SubscriptionServiceInfo } from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';

interface Pos2ClientContextProps {
    context: ContextData;
    canCollect: boolean;
    busy: boolean;
    onUseSubscriptionService: (subscription: Pos2SubscriptionInfo, service: Pos2SubscriptionServiceInfo) => void;
    onUseReward: (rewardId: number, serviceId: number | null) => void;
}

/**
 * What the caisse must see the second a client is identified (§14-§18):
 * active subscription(s) with quotas + solde + "utiliser une visite", the
 * installment collector, loyalty points and usable rewards.
 */
export function Pos2ClientContext({
    context,
    canCollect,
    busy,
    onUseSubscriptionService,
    onUseReward,
}: Pos2ClientContextProps) {
    if (context.subscriptions.length === 0 && context.rewards.length === 0 && context.points_balance <= 0) {
        return null;
    }

    return (
        <div className="space-y-2.5">
            {context.points_balance > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Star className="h-3.5 w-3.5 text-accent" />
                    {context.points_balance} points fidélité
                </p>
            )}

            {context.subscriptions.map((subscription) => (
                <SubscriptionCard
                    key={subscription.id}
                    subscription={subscription}
                    canCollect={canCollect}
                    busy={busy}
                    onUseService={(service) => onUseSubscriptionService(subscription, service)}
                />
            ))}

            {context.rewards.length > 0 && (
                <div className="rounded-md border border-accent/25 bg-accent/[0.05] p-3">
                    <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
                        <Gift className="h-3.5 w-3.5" />
                        Récompenses disponibles
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {context.rewards.map((reward) => (
                            <Chip
                                key={reward.id}
                                size="sm"
                                disabled={busy}
                                onClick={() => onUseReward(reward.id, reward.service_id)}
                            >
                                <Gift />
                                {reward.service_name ?? reward.program_name ?? 'Récompense'}
                            </Chip>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SubscriptionCard({
    subscription,
    canCollect,
    busy,
    onUseService,
}: {
    subscription: Pos2SubscriptionInfo;
    canCollect: boolean;
    busy: boolean;
    onUseService: (service: Pos2SubscriptionServiceInfo) => void;
}) {
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(true);
    const [collecting, setCollecting] = useState(false);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<'especes' | 'carte' | 'virement' | 'autre'>('especes');

    const remaining = subscription.payment.remaining;
    const hasBalance = remaining !== null && remaining > 0;

    const payMutation = useMutation({
        mutationFn: () =>
            recordPos2SubscriptionPayment(subscription.id, {
                amount: Number(amount.replace(',', '.')),
                payment_method: method,
            }),
        onSuccess: () => {
            setAmount('');
            setCollecting(false);
            void queryClient.invalidateQueries({ queryKey: pos2Keys.all });
        },
    });

    const endsOn = subscription.ends_on
        ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
              new Date(`${subscription.ends_on}T00:00:00`),
          )
        : null;

    return (
        <div
            className={cn(
                'rounded-md border p-3',
                subscription.usable
                    ? 'border-success/30 bg-success/[0.06]'
                    : 'border-destructive/25 bg-destructive/[0.05]',
            )}
        >
            <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpanded((value) => !value)}
            >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                    <BadgeCheck className={cn('h-4 w-4 shrink-0', subscription.usable ? 'text-success' : 'text-destructive')} />
                    <span className="truncate text-sm font-semibold text-foreground">
                        {subscription.plan_name ?? 'Abonnement'}
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                    {endsOn && <span className="text-[11px] text-muted-foreground">jusqu'au {endsOn}</span>}
                    <ChevronDown
                        className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                    />
                </span>
            </button>

            {!subscription.usable && subscription.block_reason && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                    {subscription.block_reason}
                </p>
            )}

            {expanded && (
                <div className="mt-2.5 space-y-2.5">
                    {(subscription.rules.time_start || subscription.rules.allowed_days.length > 0) && (
                        <p className="text-[11px] text-muted-foreground">
                            {subscription.rules.time_start && subscription.rules.time_end
                                ? `Horaires : ${subscription.rules.time_start} – ${subscription.rules.time_end}`
                                : null}
                        </p>
                    )}

                    <ul className="space-y-1.5">
                        {subscription.services.map((service) => {
                            const exhausted =
                                (service.period_remaining !== null && service.period_remaining <= 0) ||
                                (service.total_remaining !== null && service.total_remaining <= 0);
                            return (
                                <li key={service.subscription_plan_service_id} className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-medium text-foreground">
                                            {service.service_name ?? 'Service'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {service.unlimited
                                                ? 'Illimité'
                                                : [
                                                      service.period_remaining !== null
                                                          ? `${service.period_remaining} restante(s) / période`
                                                          : null,
                                                      service.total_remaining !== null
                                                          ? `${service.total_remaining} au total`
                                                          : null,
                                                  ]
                                                      .filter(Boolean)
                                                      .join(' · ')}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 shrink-0"
                                        disabled={busy || !subscription.usable || exhausted}
                                        onClick={() => onUseService(service)}
                                    >
                                        Utiliser une visite
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Solde / versements (§16-§17) */}
                    {subscription.payment.total !== null && (
                        <div className="rounded-sm border border-tint/[0.08] bg-tint/[0.03] p-2.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                    Payé {formatCurrency(subscription.payment.paid)} /{' '}
                                    {formatCurrency(subscription.payment.total)}
                                </span>
                                {hasBalance ? (
                                    <span className="font-semibold text-destructive">
                                        Reste {formatCurrency(remaining)}
                                    </span>
                                ) : (
                                    <span className="font-medium text-success">Soldé</span>
                                )}
                            </div>

                            {hasBalance && canCollect && (
                                <div className="mt-2">
                                    {collecting ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    inputMode="decimal"
                                                    value={amount}
                                                    onChange={(event) => setAmount(event.target.value)}
                                                    placeholder={`max ${remaining}`}
                                                    className="h-9 text-right tabular-nums"
                                                    autoFocus
                                                />
                                                <div className="flex gap-1">
                                                    {(['especes', 'carte'] as const).map((value) => (
                                                        <Chip
                                                            key={value}
                                                            size="sm"
                                                            selected={method === value}
                                                            onClick={() => setMethod(value)}
                                                        >
                                                            {value === 'especes' ? 'Espèces' : 'Carte'}
                                                        </Chip>
                                                    ))}
                                                </div>
                                            </div>
                                            {payMutation.isError && (
                                                <p className="text-xs text-destructive">
                                                    {getErrorMessage(payMutation.error)}
                                                </p>
                                            )}
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setCollecting(false)}
                                                >
                                                    Annuler
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="accent"
                                                    size="sm"
                                                    disabled={payMutation.isPending || !amount.trim()}
                                                    onClick={() => payMutation.mutate()}
                                                >
                                                    {payMutation.isPending && <Loader2 className="animate-spin" />}
                                                    Encaisser le versement
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-full"
                                            onClick={() => setCollecting(true)}
                                        >
                                            <HandCoins />
                                            Encaisser un versement
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
