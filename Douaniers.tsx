import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, PaginatedTable } from '../components/UI';
import { fmtM, fmt } from '../services/api';

const CHART_TT = {
  contentStyle: { background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9', fontSize: 12 },
  labelStyle: { color: '#94a3b8', fontSize: 11 },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ACTIF:                { label: 'ACTIF',          color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  ELIGIBLE_PROMOTION:   { label: '\u00c9LIGIBLE PROMO', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  ALERTE_SURMENAGE:     { label: 'SURMENAGE',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  RISQUE_REDEPLOIEMENT: { label: 'RED\u00c9PLOIEMENT',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const DouaniersPage = () => {
  const { data, loading, error } = useApi<any>('officers');
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [filterBureau, setFilterBureau] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  const analysis = useMemo(() => {
    if (!data?.officers) return null;
    const officers = data.officers as any[];
    const total = officers.length;
    const actifs = officers.filter((o: any) => o.career_status === 'ACTIF').length;
    const surmenage = officers.filter((o: any) => o.career_status === 'ALERTE_SURMENAGE' || o.burnout_risk === 'HIGH').length;
    const totalDecl = officers.reduce((s: number, o: any) => s + (o.total_declarations || 0), 0);
    const totalFraud = officers.reduce((s: number, o: any) => s + (o.fraud_detected || 0), 0);
    const avgClearance = total > 0 ? Math.round(officers.reduce((s: number, o: any) => s + (o.avg_clearance_hours || 0), 0) / total) : 0;

    const bureaux = new Set<string>();
    officers.forEach((o: any) => (o.bureau_ids || []).forEach((b: string) => bureaux.add(b)));

    const byBureau: Record<string, { agents: number; declarations: number; fraud: number }> = {};
    officers.forEach((o: any) => {
      (o.bureau_ids || ['N/A']).forEach((b: string) => {
        if (!byBureau[b]) byBureau[b] = { agents: 0, declarations: 0, fraud: 0 };
        byBureau[b].agents++;
        byBureau[b].declarations += o.total_declarations || 0;
        byBureau[b].fraud += o.fraud_detected || 0;
      });
    });
    const bureauWorkload = Object.entries(byBureau)
      .map(([name, v]) => ({ name, ...v, avgDecl: v.agents > 0 ? Math.round(v.declarations / v.agents) : 0 }))
      .sort((a, b) => b.declarations - a.declarations);

    return { officers, total, actifs, surmenage, totalDecl, totalFraud, avgClearance, bureaux: Array.from(bureaux).sort(), bureauWorkload };
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!analysis) return <ErrorBox message="Aucune donn\u00e9e disponible" />;

  const { officers, total, actifs, surmenage, totalDecl, totalFraud, avgClearance, bureaux, bureauWorkload } = analysis;

  const filtered = officers.filter((o: any) => {
    if (filterBureau !== 'all' && !(o.bureau_ids || []).includes(filterBureau)) return false;
    if (filterStatus !== 'all' && o.career_status !== filterStatus) return false;
    if (search && !o.name?.toLowerCase().includes(search.toLowerCase()) && !o.officer_id?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Douaniers" subtitle={"Gestion op\u00e9rationnelle des agents \u2014 Assignation, contr\u00f4les et indicateurs quotidiens"} icon={"\ud83d\udc6e"} />

      <FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard label="Agents enregistr\u00e9s" value={total} icon={"\ud83d\udc64"} color="#3b82f6" />
          <KPICard label="Agents actifs" value={actifs} icon={"\u2705"} color="#10b981" sub={`${total > 0 ? Math.round((actifs/total)*100) : 0}%`} />
          <KPICard label="Alerte surmenage" value={surmenage} icon={"\u26a0\ufe0f"} color="#f59e0b" />
          <KPICard label={"Contr\u00f4les r\u00e9alis\u00e9s"} value={fmt(totalDecl)} icon={"\ud83d\udccb"} color="#8b5cf6" />
          <KPICard label={"D\u00e9lai moyen traitement"} value={`${avgClearance}h`} icon={"\u23f1\ufe0f"} color="#06b6d4" />
        </div>
      </FadeIn>

      <FadeIn>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Rechercher un agent..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 w-48 focus:outline-none focus:border-blue-500/50" />
          <select value={filterBureau} onChange={e => setFilterBureau(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="all">Tous les bureaux</option>
            {bureaux.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-xs text-muted ml-auto">{filtered.length} agent{filtered.length > 1 ? 's' : ''} affich{"\u00e9"}{filtered.length > 1 ? 's' : ''}</span>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FadeIn>
          <div className="card">
            <SectionTitle icon={"\ud83c\udfdb\ufe0f"}>Charge de Travail par Bureau {"\u2014"} D{"\u00e9"}clarations / Agent</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={bureauWorkload.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10 }} width={80} />
                <Tooltip {...CHART_TT} />
                <Bar dataKey="avgDecl" name="D\u00e9cl. / Agent" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={1000}>
                  {bureauWorkload.slice(0, 8).map((b, i) => (
                    <Cell key={i} fill={b.avgDecl > 50 ? '#ef4444' : b.avgDecl > 30 ? '#f59e0b' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>

        <FadeIn>
          <div className="card">
            <SectionTitle icon={"\ud83d\udcca"}>R{"\u00e9"}partition des Statuts {"\u2014"} Vue Op{"\u00e9"}rationnelle</SectionTitle>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {Object.entries(STATUS_MAP).map(([key, { label, color, bg }]) => {
                const count = officers.filter((o: any) => o.career_status === key).length;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <motion.div key={key} whileHover={{ scale: 1.02 }}
                    className="p-4 rounded-xl cursor-pointer transition-all" style={{ background: bg, border: `1px solid ${color}30` }}
                    onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}>
                    <div className="text-2xl font-black mb-1" style={{ color }}>{count}</div>
                    <div className="text-xs font-semibold text-white mb-1">{label}</div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8 }} style={{ background: color }} />
                    </div>
                    <div className="text-[10px] text-muted mt-1">{pct}% de l{"'"}effectif</div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </div>

      <FadeIn>
        <div className="card">
          <SectionTitle icon={"\ud83d\udccb"}>Liste des Agents {"\u2014"} Assignation & Indicateurs Op{"\u00e9"}rationnels</SectionTitle>
          <PaginatedTable
            headers={
              <tr>
                <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Agent</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Bureau(x)</th>
                <th className="text-center text-xs font-semibold text-slate-400 px-3 py-2">Statut</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">D{"\u00e9"}clarations</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Fraudes</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Taux D{"\u00e9"}tection</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">D{"\u00e9"}lai Moy.</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Recettes</th>
                <th className="text-center text-xs font-semibold text-slate-400 px-3 py-2">D{"\u00e9"}tail</th>
              </tr>
            }
            rows={filtered.map((o: any, i: number) => {
              const st = STATUS_MAP[o.career_status] || STATUS_MAP.ACTIF;
              const detRate = (o.fraud_detection_rate * 100).toFixed(1);
              const delayColor = o.avg_clearance_hours > o.bureau_baseline_hours * 1.3 ? '#ef4444' : o.avg_clearance_hours > o.bureau_baseline_hours ? '#f59e0b' : '#10b981';
              return (
                <motion.tr key={o.officer_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2">
                    <div className="text-xs font-bold text-white">{o.name}</div>
                    <div className="text-[10px] text-slate-500">{o.officer_id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(o.bureau_ids || []).map((b: string) => (
                        <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300">{b}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-white">{fmt(o.total_declarations)}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-red-400">{o.fraud_detected}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: parseFloat(detRate) > 30 ? '#10b981' : parseFloat(detRate) > 15 ? '#f59e0b' : '#ef4444' }}>{detRate}%</td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs font-semibold" style={{ color: delayColor }}>{o.avg_clearance_hours}h</span>
                    <span className="text-[10px] text-muted"> / {o.bureau_baseline_hours}h</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">{fmtM(o.revenue_recovered)}</td>
                  <td className="px-3 py-2 text-center">
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      onClick={() => setSelectedAgent(o)}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10">
                      Voir {"\u2192"}
                    </motion.button>
                  </td>
                </motion.tr>
              );
            })}
          />
        </div>
      </FadeIn>

      <AnimatePresence>
        {selectedAgent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setSelectedAgent(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="card max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black text-white">{selectedAgent.name}</h3>
                  <p className="text-xs text-muted">{selectedAgent.officer_id} {"\u00b7"} {(selectedAgent.bureau_ids || []).join(', ')}</p>
                </div>
                <button onClick={() => setSelectedAgent(null)} className="text-slate-400 hover:text-white text-lg">{"\u2715"}</button>
              </div>
              <div className="space-y-2">
                {[
                  ['D\u00e9clarations trait\u00e9es', fmt(selectedAgent.total_declarations)],
                  ['Fraudes d\u00e9tect\u00e9es', selectedAgent.fraud_detected.toString()],
                  ['Taux de d\u00e9tection', (selectedAgent.fraud_detection_rate * 100).toFixed(1) + '%'],
                  ['D\u00e9lai moyen', selectedAgent.avg_clearance_hours + 'h vs ' + selectedAgent.bureau_baseline_hours + 'h (baseline)'],
                  ['Recettes recouvr\u00e9es', fmtM(selectedAgent.revenue_recovered) + ' FCFA'],
                  ['Rang dans le bureau', `#${selectedAgent.rank_in_bureau} / ${selectedAgent.total_in_bureau}`],
                  ['Risque de surmenage', selectedAgent.burnout_risk],
                  ['Statut carri\u00e8re', STATUS_MAP[selectedAgent.career_status]?.label || selectedAgent.career_status],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-xs text-muted">{k}</span>
                    <span className="text-xs font-semibold text-white">{v}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DouaniersPage;
