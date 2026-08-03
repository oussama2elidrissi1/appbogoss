import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Mail, Pencil, Phone, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { createClient, deleteClient, getClients, getErrorMessage, updateClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Client, ClientPayload } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';

const emptyForm = { name: '', email: '', phone: '', notes: '' };
type ClientForm = typeof emptyForm;

function toForm(client: Client): ClientForm {
    return { name: client.name, email: client.email ?? '', phone: client.phone ?? '', notes: client.notes ?? '' };
}

function toPayload(form: ClientForm): ClientPayload {
    return { name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, notes: form.notes.trim() || null };
}

export default function Clients() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Client | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<ClientForm>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingClient, setDeletingClient] = useState<Client | null>(null);

    const { data: clients = [], isPending, isError, error, refetch } = useQuery({
        queryKey: ['clients', 'admin', search],
        queryFn: () => getClients(search.trim() || undefined),
    });

    const stats = useMemo(() => ({
        total: clients.length,
        returning: clients.filter((client) => (client.sales_count ?? 0) > 0).length,
        appointments: clients.reduce((sum, client) => sum + (client.appointments_count ?? 0), 0),
    }), [clients]);

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const createMutation = useMutation({ mutationFn: createClient, onSuccess: () => { refresh(); closeDialog(); }, onError: (e) => setFormError(getErrorMessage(e)) });
    const updateMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: ClientPayload }) => updateClient(id, payload), onSuccess: () => { refresh(); closeDialog(); }, onError: (e) => setFormError(getErrorMessage(e)) });
    const deleteMutation = useMutation({ mutationFn: deleteClient, onSuccess: refresh });
    const saving = createMutation.isPending || updateMutation.isPending;

    function openCreate() { setEditing(null); setForm(emptyForm); setFormError(null); setDialogOpen(true); }
    function openEdit(client: Client) { setEditing(client); setForm(toForm(client)); setFormError(null); setDialogOpen(true); }
    function closeDialog() { setDialogOpen(false); setEditing(null); setForm(emptyForm); setFormError(null); }
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);
        const payload = toPayload(form);
        if (!payload.name) { setFormError('Le nom du client est obligatoire.'); return; }
        if (editing) updateMutation.mutate({ id: editing.id, payload });
        else createMutation.mutate(payload);
    }
    function remove(client: Client) {
        setDeletingClient(client);
    }
    function confirmRemove() {
        if (!deletingClient) return;
        deleteMutation.mutate(deletingClient.id, { onSuccess: () => setDeletingClient(null) });
    }

    if (isError) return <Card className="flex flex-col items-center justify-center px-6 py-16 text-center"><AlertCircle className="h-6 w-6 text-destructive" /><h2 className="mt-4 text-base font-semibold">Impossible de charger les clients</h2><p className="mt-2 text-sm text-muted-foreground">{getErrorMessage(error)}</p><Button variant="accent" className="mt-6" onClick={() => void refetch()}>Réessayer</Button></Card>;

    return <>
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div><h2 className="text-2xl font-semibold tracking-tight">Clients</h2><p className="mt-1.5 text-sm text-muted-foreground">Fiches clients, visites, rendez-vous et coordonnées.</p></div>
                <div className="flex flex-col gap-3 sm:flex-row"><div className="relative sm:w-72"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client..." className="pl-10" /></div><Button variant="accent" onClick={openCreate}><Plus /> Ajouter</Button></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Card className="px-4 py-3"><p className="text-xs text-muted-foreground">Clients affichés</p><p className="mt-1 text-xl font-semibold tabular-nums">{stats.total}</p></Card><Card className="px-4 py-3"><p className="text-xs text-muted-foreground">Avec historique</p><p className="mt-1 text-xl font-semibold tabular-nums text-success">{stats.returning}</p></Card><Card className="px-4 py-3"><p className="text-xs text-muted-foreground">Rendez-vous liés</p><p className="mt-1 text-xl font-semibold tabular-nums">{stats.appointments}</p></Card></div>
            {isPending ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Card key={index} className="p-5"><Skeleton className="h-12 w-full" /></Card>)}</div> : clients.length === 0 ? <EmptyState icon={UserRound} title="Aucun client" description="Ajoutez votre premier client pour le retrouver dans la caisse et l'agenda." /> : <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{clients.map((client) => <Card key={client.id} className="p-5 transition-colors hover:border-accent/25"><div className="flex items-start gap-3"><EmployeeAvatar name={client.name} color={client.avatar_color ?? '#4C7CC8'} size="lg" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{client.name}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Phone className="h-3 w-3" />{client.phone || 'Téléphone non renseigné'}</p></div><div className="flex shrink-0 gap-1"><Button type="button" size="icon" variant="ghost" aria-label="Modifier le client" onClick={() => openEdit(client)}><Pencil /></Button><Button type="button" size="icon" variant="ghost" aria-label="Supprimer le client" onClick={() => remove(client)}><Trash2 className="text-destructive" /></Button></div></div><div className="mt-4 flex flex-wrap gap-2"><Badge variant="accent">{client.sales_count ?? 0} visite{(client.sales_count ?? 0) > 1 ? 's' : ''}</Badge><Badge variant="outline">{client.appointments_count ?? 0} rendez-vous</Badge>{client.loyalty_points > 0 && <Badge variant="success">{client.loyalty_points} points</Badge>}</div><div className="mt-3 space-y-1 text-xs text-muted-foreground">{client.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{client.email}</p>}{client.last_visit_at && <p>Dernière visite : {formatDate(client.last_visit_at)}</p>}{client.notes && <p className="line-clamp-2">{client.notes}</p>}</div></Card>)}</div>}
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Modifier le client' : 'Nouveau client'}</DialogTitle><DialogDescription>Les informations seront disponibles dans la caisse et l'agenda.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="client-name">Nom complet</Label><Input id="client-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="client-phone">Téléphone</Label><Input id="client-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="client-email">Email</Label><Input id="client-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="client-notes">Notes</Label><textarea id="client-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-24 w-full rounded-md border border-input bg-tint/[0.03] px-3.5 py-2 text-sm text-foreground outline-none focus:border-accent/60" /></div>{formError && <p className="text-sm text-destructive">{formError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Annuler</Button><Button type="submit" variant="accent" disabled={saving}>{saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer le client'}</Button></DialogFooter></form></DialogContent></Dialog>
        <ConfirmDialog open={deletingClient !== null} onOpenChange={(open) => { if (!open) setDeletingClient(null); }} title="Supprimer ce client ?" description={deletingClient ? `${deletingClient.name} sera définitivement supprimé(e).` : undefined} confirmLabel="Supprimer" loading={deleteMutation.isPending} onConfirm={confirmRemove} />
    </>;
}
