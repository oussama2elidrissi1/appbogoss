import { PackageCheck } from 'lucide-react';
import type { LowStockProduct } from '@/types/dashboard';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from './EmptyState';

export function LowStockCard({ products }: { products: LowStockProduct[] }) {
    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle>Stock faible</CardTitle>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Produits sous le seuil d’alerte
                    </p>
                </div>
                {products.length > 0 && (
                    <Badge variant="destructive">{products.length}</Badge>
                )}
            </CardHeader>

            <CardContent>
                {products.length === 0 ? (
                    <EmptyState
                        icon={PackageCheck}
                        title="Stock au vert"
                        description="Tous les produits sont au-dessus de leur seuil d’alerte."
                    />
                ) : (
                    <ul className="space-y-4">
                        {products.map((product) => {
                            const threshold = Math.max(product.low_stock_threshold, 1);
                            const ratio = Math.min(product.stock_quantity / threshold, 1);
                            const critical = ratio <= 0.34;

                            return (
                                <li key={product.id} className="space-y-2">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {product.name}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {product.category}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                            <span
                                                className={cn(
                                                    'font-semibold',
                                                    critical ? 'text-destructive' : 'text-foreground',
                                                )}
                                            >
                                                {product.stock_quantity}
                                            </span>
                                            {' / '}
                                            {product.low_stock_threshold}
                                        </p>
                                    </div>

                                    <div
                                        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
                                        role="progressbar"
                                        aria-valuenow={product.stock_quantity}
                                        aria-valuemin={0}
                                        aria-valuemax={product.low_stock_threshold}
                                        aria-label={`Stock de ${product.name}`}
                                    >
                                        <div
                                            className={cn(
                                                'h-full rounded-full transition-all duration-500 ease-out',
                                                critical ? 'bg-destructive' : 'bg-accent',
                                            )}
                                            style={{ width: `${Math.max(ratio * 100, 4)}%` }}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
