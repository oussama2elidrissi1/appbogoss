import { useMemo, useState } from 'react';
import type { Appointment, ReservationItem, Service } from '@/types/workday';
import { t } from '@/lib/i18n';
import { itemsOf } from './agendaEvents';

export interface PersonDraft {
    name: string | null;
}

export interface ItemDraft {
    /** Echoed back unchanged for an untouched line so the server preserves its price/commission snapshot. */
    uid?: string | null;
    service_id: number;
    employee_id: number | null;
    person_index: number;
}

/**
 * Shared cart state machine behind both the staff `ReservationDialog` and
 * the partner `PartnerNewReservation` wizard: one booking contact (index 0
 * of `people`), any number of additional participants, and any number of
 * services assigned per participant. Extracted so both surfaces build the
 * exact same `items`/`people` payload shape the backend expects — see
 * AppointmentController::payloadWithEnd().
 */
export function useReservationCart(services: Service[]) {
    const [people, setPeople] = useState<PersonDraft[]>([{ name: null }]);
    const [items, setItems] = useState<ItemDraft[]>([]);
    const [activePerson, setActivePerson] = useState(0);

    const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);

    const totalPrice = items.reduce((total, item) => total + (serviceById.get(item.service_id)?.price ?? 0), 0);

    /** Mirrors the server rule: parallel chains per employee, per person for unassigned lines. */
    const totalDuration = useMemo(() => {
        const chains = new Map<string, number>();
        items.forEach((item) => {
            const service = serviceById.get(item.service_id);
            if (!service) return;
            const key = item.employee_id ? `e${item.employee_id}` : `p${item.person_index}`;
            chains.set(key, (chains.get(key) ?? 0) + service.duration_minutes);
        });
        return Math.max(0, ...chains.values());
    }, [items, serviceById]);

    function personLabel(index: number): string {
        const name = people[index]?.name?.trim();
        return name || t('Personne {n}', { n: index + 1 });
    }

    function itemsOfPerson(index: number): Array<{ item: ItemDraft; itemIndex: number }> {
        return items
            .map((item, itemIndex) => ({ item, itemIndex }))
            .filter(({ item }) => item.person_index === index);
    }

    function addPerson() {
        setPeople((current) => {
            setActivePerson(current.length);
            return [...current, { name: null }];
        });
    }

    function removePerson(index: number) {
        if (index === 0) return;
        setPeople((current) => current.filter((_, personIndex) => personIndex !== index));
        setItems((current) =>
            current
                .filter((item) => item.person_index !== index)
                .map((item) => ({
                    ...item,
                    person_index: item.person_index > index ? item.person_index - 1 : item.person_index,
                })),
        );
        setActivePerson((current) => (current >= index ? Math.max(0, current - 1) : current));
    }

    function renamePerson(index: number, name: string) {
        setPeople((current) =>
            current.map((person, personIndex) => (personIndex === index ? { name: name || null } : person)),
        );
    }

    /** Cart-style: every click adds a new line for the given (or active) person. */
    function addService(service: Service, personIndex?: number, employeeId: number | null = null) {
        setItems((current) => [
            ...current,
            { service_id: service.id, employee_id: employeeId, person_index: personIndex ?? activePerson },
        ]);
    }

    function removeItemAt(itemIndex: number) {
        setItems((current) => current.filter((_, index) => index !== itemIndex));
    }

    function assignEmployeeAt(itemIndex: number, employeeId: number | null) {
        setItems((current) =>
            current.map((item, index) => (index === itemIndex ? { ...item, employee_id: employeeId } : item)),
        );
    }

    /** §9 — "Appliquer les mêmes prestations à tous": copies fromPerson's service lines onto every other participant. */
    function duplicateServicesToAll(fromPersonIndex: number) {
        const source = itemsOfPerson(fromPersonIndex).map(({ item }) => item);
        if (source.length === 0) return;
        setItems((current) => {
            const additions = people.flatMap((_, personIndex) => {
                if (personIndex === fromPersonIndex) return [];
                return source.map((item) => ({
                    service_id: item.service_id,
                    employee_id: null,
                    person_index: personIndex,
                }));
            });
            return [...current, ...additions];
        });
    }

    const personsWithoutService = people
        .map((_, index) => index)
        .filter((index) => itemsOfPerson(index).length === 0);

    /** Hydrates the cart from an existing appointment (edit mode). */
    function hydrateFromAppointment(appointment: Appointment) {
        setItems(
            itemsOf(appointment).map((item: ReservationItem) => ({
                uid: item.uid ?? null,
                service_id: item.service_id,
                employee_id: item.employee_id,
                person_index: item.person_index ?? 0,
            })),
        );
        const hydratedPeople: PersonDraft[] = appointment.people?.length
            ? appointment.people.map((person) => ({ name: person.name ?? null }))
            : appointment.clients?.length
              ? appointment.clients.map((client) => ({ name: client.name }))
              : [{ name: appointment.client?.name ?? null }];
        setPeople(hydratedPeople);
        setActivePerson(0);
    }

    function reset() {
        setItems([]);
        setPeople([{ name: null }]);
        setActivePerson(0);
    }

    return {
        people,
        items,
        activePerson,
        setActivePerson,
        setPeople,
        setItems,
        serviceById,
        totalPrice,
        totalDuration,
        personLabel,
        itemsOfPerson,
        addPerson,
        removePerson,
        renamePerson,
        addService,
        removeItemAt,
        assignEmployeeAt,
        duplicateServicesToAll,
        personsWithoutService,
        hydrateFromAppointment,
        reset,
    };
}

export type ReservationCart = ReturnType<typeof useReservationCart>;
