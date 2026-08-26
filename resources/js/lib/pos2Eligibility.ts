import type { Employee, Service } from '@/types/workday';

/**
 * Frontend mirror of Employee::canPerform() — the single skills relation
 * (employees.service_categories + employees.allowed_service_ids, both
 * empty = no restriction). Keep the two implementations in sync.
 */
export function canPerform(
    employee: Pick<Employee, 'is_active' | 'service_categories' | 'allowed_service_ids'>,
    service: Pick<Service, 'id' | 'category'>,
): boolean {
    if (!employee.is_active) return false;

    const categories = (employee.service_categories ?? []).filter(Boolean);
    if (categories.length > 0 && !categories.includes(service.category)) return false;

    const serviceIds = (employee.allowed_service_ids ?? []).filter((id) => id != null);
    if (serviceIds.length > 0 && !serviceIds.includes(service.id)) return false;

    return true;
}

export function eligibleEmployees(
    employees: Employee[],
    service: Pick<Service, 'id' | 'category'>,
): Employee[] {
    return employees.filter((employee) => canPerform(employee, service));
}

/** Eligible employees for an invoice LINE (service line or free-text). */
export function eligibleEmployeesForLine(
    employees: Employee[],
    line: { service_id: number | null; category: string | null },
): Employee[] {
    if (line.service_id === null) return employees.filter((employee) => employee.is_active);
    return eligibleEmployees(employees, { id: line.service_id, category: line.category ?? '' });
}
