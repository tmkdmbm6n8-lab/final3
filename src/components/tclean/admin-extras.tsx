import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteDiscount, deleteReview, getReviews, listDiscounts, saveDiscount } from '@/lib/business.functions';

export function AdminDiscounts() {
  const list = useServerFn(listDiscounts); const save = useServerFn(saveDiscount); const del = useServerFn(deleteDiscount);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listDiscounts>>>([]); const [code, setCode] = useState(''); const [percent, setPercent] = useState('10');
  const [mode, setMode] = useState<'permanent' | 'period'>('permanent');
  const [startsAt, setStartsAt] = useState(''); const [endsAt, setEndsAt] = useState('');
  const [singleUse, setSingleUse] = useState(false); const [busy, setBusy] = useState(false);
  const refresh = () => list().then(setRows).catch(e => toast.error(e.message));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); } };
  return <div className="grid gap-4">
    <form className="grid gap-4" onSubmit={async e => {
      e.preventDefault();
      if (busy) return;
      if (mode === 'period' && (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt))) {
        toast.error('La fin doit être après le début.'); return;
      }
      setBusy(true);
      try {
        await save({ data: { code, percent: Number(percent), active: true,
          starts_at: mode === 'period' ? new Date(startsAt).toISOString() : null,
          ends_at: mode === 'period' ? new Date(endsAt).toISOString() : null,
          single_use: singleUse } });
        setCode(''); toast.success('Code créé.'); await refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
      finally { setBusy(false); }
    }}>
      <div className="inline-actions">
      <div className="field"><label htmlFor="dc-code">Code (lettres, chiffres, - ou _)</label><input id="dc-code" required value={code} maxLength={40} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="BIENVENUE10" /></div>
      <div className="field"><label htmlFor="dc-pct">Réduction (%)</label><input id="dc-pct" type="number" min={1} max={100} step="0.5" required value={percent} onChange={e => setPercent(e.target.value)} /></div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Validité</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="radio" name="promo-mode" checked={mode === 'permanent'} onChange={() => setMode('permanent')} />Permanent</label>
          <label className="flex items-center gap-2"><input type="radio" name="promo-mode" checked={mode === 'period'} onChange={() => setMode('period')} />Période définie</label>
        </div>
      </fieldset>
      {mode === 'period' && <div className="grid gap-4 sm:grid-cols-2">
        <div className="field"><label htmlFor="dc-start">Début — heure de votre appareil</label><input id="dc-start" type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
        <div className="field"><label htmlFor="dc-end">Fin — heure de votre appareil</label><input id="dc-end" type="datetime-local" required value={endsAt} onChange={e => setEndsAt(e.target.value)} /></div>
      </div>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={singleUse} onChange={e => setSingleUse(e.target.checked)} />Usage unique</label>
      <Button type="submit" disabled={busy} className="justify-self-start"><Plus />{busy ? 'Enregistrement…' : 'Créer le code'}</Button>
    </form>
    {rows.length === 0 ? <p className="notice">Aucun code pour le moment.</p> : rows.map(r => <div key={r.code} className="admin-item inline-actions justify-between"><span><strong>{r.code}</strong> · -{Number(r.percent)} % · {r.active ? 'actif' : 'désactivé'}<br /><small className="text-muted-foreground">
      {r.ends_at ? `Du ${new Date(r.starts_at ?? r.created_at).toLocaleString('fr-FR')} au ${new Date(r.ends_at).toLocaleString('fr-FR')}` : 'Permanent'}
      {r.single_use && ' · Usage unique'}{r.single_use && r.used_at ? ' · Utilisé' : r.ends_at && Date.now() >= Date.parse(r.ends_at) ? ' · Expiré' : r.starts_at && Date.now() < Date.parse(r.starts_at) ? ' · À venir' : ''}
    </small></span><span className="inline-actions">
      <Button size="sm" variant="outline" onClick={() => act(() => save({ data: { code: r.code, percent: Number(r.percent), active: !r.active, starts_at: r.starts_at, ends_at: r.ends_at, single_use: r.single_use } }), r.active ? 'Code désactivé.' : 'Code activé.')}>{r.active ? 'Désactiver' : 'Activer'}</Button>
      <Button size="sm" variant="outline" aria-label={`Supprimer ${r.code}`} onClick={() => act(() => del({ data: r.code }), 'Code supprimé.')}><Trash2 /></Button></span></div>)}
  </div>;
}

export function AdminReviews() {
  const load = useServerFn(getReviews); const del = useServerFn(deleteReview); const qc = useQueryClient();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getReviews>>>([]);
  const refresh = () => load().then(setRows).catch(e => toast.error(e.message));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="grid gap-4"><p className="text-sm">Les avis sont publiés immédiatement. Vous pouvez supprimer un avis inapproprié.</p>
    {rows.length === 0 ? <p className="notice">Aucun avis pour le moment.</p> : rows.map(r => <div key={r.id} className="admin-item inline-actions justify-between"><span><strong>{r.author}</strong> · {r.rating}/5 · {new Date(r.created_at).toLocaleDateString('fr-FR')}{r.comment && <><br />{r.comment}</>}{r.photo && <><br /><img src={r.photo} alt="" width={120} /></>}</span>
      <Button size="sm" variant="outline" onClick={async () => { if (!confirm('Supprimer cet avis ?')) return; try { await del({ data: r.id }); toast.success('Avis supprimé.'); refresh(); qc.invalidateQueries({ queryKey: ['reviews'] }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); } }}><Trash2 />Supprimer</Button></div>)}
  </div>;
}
