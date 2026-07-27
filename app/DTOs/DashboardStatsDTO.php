<?php

namespace App\DTOs;

class DashboardStatsDTO
{
    public function __construct(
        public readonly array $kpis,
        public readonly array $revenueSeries,
        public readonly array $lowStockProducts,
        public readonly array $recentActivity,
        public readonly array $appointmentQueue,
    ) {
    }

    public function toArray(): array
    {
        return [
            'kpis' => $this->kpis,
            'revenue_series' => $this->revenueSeries,
            'low_stock_products' => $this->lowStockProducts,
            'recent_activity' => $this->recentActivity,
            'appointment_queue' => $this->appointmentQueue,
        ];
    }
}
