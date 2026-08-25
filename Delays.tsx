import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, PaginatedTable } from '../components/UI';
import { fmtM, fmt } from '../services/api';

const CHART_TT = {
  contentStyle: { background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9', fontSize: 12 },
  labelStyle: { color: '#94a3b8', fontSize: 11 },
};

const STATUS_COLORS: Record<string, string> = {
  critical: '#ef4444', warning: '#f59e0b', elevated: '#f97316', normal: '#10b981',
};

const DelaysPage = () => {
  const { data, loading, error } = useApi<any>('fraud');
  const [selectedBureau, setSelectedBureau] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (!data) return null;
    const delays = data.delays || [];
    const causes = data.delay_causes || [];
    const totalDelays = delays.length;
    const avgHours = totalDelays > 0 ? Math.round(delays.reduce((s: number, d: any) => s + (d.delay_hours || d.hours || 0), 0) / totalDelays) : 0;
    const critical = delays.filter((d: any) => (d.delay_hours || d.hours || 0) > 72).length;
    const criticalPct = totalDelays > 0 ? Math.round((critical / totalDelays) * 100) : 0;

    const byBureau: Record<string, { count: number; totalHours: number; declarations: any[] }> = {};
    delays.forEach((d: any) => {
      const bureau = d.office_name || d.office_id || d.bureau || 'Inconnu';
      if (!byBureau[bureau]) byBureau[bureau] = { count: 0, totalHours: 0, declarations: [] };
      byBureau[bureau].count++;
      byBureau[bureau].totalHours += (d.delay_hours || d.hours || 0);
      byBureau[bureau].declarations.push(d);
    });
    const bureauRanking = Object.entries(byBureau)
      .map(([name, v]) => ({ name, count: v.count, avgHours: Math.round(v.totalHours / v.count), declarations: v.declarations }))
      .sort((a, b) => b.avgHours - a.avgHours);

    const byAgent: Record<string, number> = {};
    delays.forEach((d: any) => {
      const agent = d.declarant_name || d.agent_name || d.declarant_id || 'Inconnu';
      byAgent[agent] = (byAgent[agent] || 0) + 1;
    });
    const suspiciousAgents = Object.entries(byAgent)
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a);

    const causeData = causes.length > 0
      ? causes.map((c: any) => ({
          name: c.cause || c.name || c.label || 'Autre',
          value: c.count || c.value || c.total || 1,
          fill: (c.cause || c.name || '').includes('rification') ? '#3b82f6'
            : (c.cause || c.name || '').includes('Conformit') ? '#f59e0b'
            : (c.cause || c.name || '').includes('Paiement') ? '#ef4444'
            : (c.cause || c.name || '').includes('Douanier') ? '#f97316'
            : '#8b5cf6',
        }))
      : Object.entries(byBureau).slice(0, 6).map(([name, v]) => ({
          name, value: v.count, fill: v.avgHours > 72 ? '#ef4444' : v.avgHours > 48 ? '#f59e0b' : '#3b82f6',
        }));

    const scatterData = delays.map((d: any, i: number) => ({
      x: i,
      y: d.delay_hours || d.hours || 0,
      z: d.cif_value || d.value || 1000000,
      name: d.declaration_id || d.sgd_ref || `SGD-${i}`,
      bureau: d.office_name || d.office_id || d.bureau || 'N/A',
      status: (d.delay_hours || d.hours || 0) > 72 ? 'critical' : (d.delay_hours || d.hours || 0) > 48 ? 'warning' : 'normal',
    }));

    return { delays, totalDelays, avgHours, critical, criticalPct, bureauRanking, suspiciousAgents, causeData, scatterData };
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data || !analysis) return <ErrorBox message="Aucune donn\u00e9e disponible" />;

  const { delays, totalDelays, avgHours, critical, criticalPct, bureauRanking, suspiciousAgents, causeData, scatterData } = analysis;

  return (
    <div className="space-y-6">
      <PageHeader title="D\u00e9lais Suspects" subtitle="Monitoring des anomalies de d\u00e9lais \u2014 Blocages, retards injustifi\u00e9s et sch\u00e9mas suspects" icon={"\u23f1\ufe0f"} />

      <FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="D\u00e9clarations en retard" value={totalDelays} icon={"\u26a0\ufe0f"} color="#f59e0b" />
          <KPICard label="D\u00e9lai moyen" value={`${avgHours}h`} icon={"\u23f1\ufe0f"} color="#3b82f6" />
          <KPICard label="Cas critiques (>72h)" value={critical} icon={"\ud83d\udd34"} color="#ef4444" sub={`${criticalPct}% du total`} />
          <KPICard label="Agents r\u00e9currents" value={suspiciousAgents.length} icon={"\ud83d\udd75\ufe0f"} color="#8b5cf6" sub={"\u22652 retards"} />
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FadeIn>
          <div className="card">
            <SectionTitle icon={"\ud83d\udcca"}>Distribution des Retards {"\u2014"} Heures par D{"\u00e9"}claration</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" dataKey="x" name="D\u00e9claration" tick={{ fill: '#64748b', fontSize: 9 }}
                  label={{ value: 'D\u00e9clarations', position: 'insideBottom', offset: -4, fill: '#64748b', fontSize: 9 }} />
                <YAxis type="number" dataKey="y" name="Heures" tick={{ fill: '#64748b', fontSize: 9 }}
                  label={{ value: 'Heures de retard', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} />
                <ZAxis type="number" dataKey="z" range={[30, 200]} />
                <Tooltip {...CHART_TT} formatter={(v: number, name: string) => name === 'Heures' ? [`${v}h`, 'Retard'] : [v, name]} />
                <Scatter data={scatterData} isAnimationActive animationDuration={1200}>
                  {scatterData.map((d: any, i: number) => (
                    <Cell key={i} fill={STATUS_COLORS[d.status] || '#3b82f6'} fillOpacity={0.7} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {[['Normal (<48h)', '#10b981'], ['\u00c9lev\u00e9 (48-72h)', '#f59e0b'], ['Critique (>72h)', '#ef4444']].map(([label, color]) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="w-2 h-2 rounded-full" style={{ background: color as string }} />{label}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>

        <FadeIn>
          <div className="card">
            <SectionTitle icon={"\ud83d\udd2c"}>Classificateur de Causes {"\u2014"} D{"\u00e9"}lais de D{"\u00e9"}douanement</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={causeData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10 }} width={120} />
                <Tooltip {...CHART_TT} />
                <Bar dataKey="value" name="Occurrences" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={1000}>
                  {causeData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FadeIn>
          <div className="card">
            <SectionTitle icon={"\ud83c\udfdb\ufe0f"}>Bureaux les Plus Lents {"\u2014"} D{"\u00e9"}lai Moyen</SectionTitle>
            <div className="space-y-2">
              {bureauRanking.slice(0, 8).map((b, i) => {
                const maxH = bureauRanking[0]?.avgHours || 1;
                const pct = Math.round((b.avgHours / maxH) * 100);
                const color = b.avgHours > 72 ? '#ef4444' : b.avgHours > 48 ? '#f59e0b' : '#3b82f6';
                return (
                  <motion.div key={b.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 cursor-pointer hover:bg-white/[0.02] rounded-lg p-2 -mx-2 transition-colors"
                    onClick={() => setSelectedBureau(selectedBureau === b.name ? null : b.name)}>
                    <span className="text-xs font-bold w-6 text-center" style={{ color }}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-semibold text-white truncate">{b.name}</span>
                        <span className="text-xs font-black" style={{ color }}>{b.avgHours}h moy.</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: i * 0.05 }} style={{ background: color }} />
                      </div>
                    </div>
                    <span className="text-xs text-muted">{b.count} cas</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>

        <FadeIn>
          <div className="card">
            <SectionTitle icon={"\ud83d\udd75\ufe0f"}>Agents avec Retards R{"\u00e9"}currents {"\u2014"} Sch{"\u00e9"}mas Suspects</SectionTitle>
            {suspiciousAgents.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted text-sm">Aucun agent avec retards r{"\u00e9"}currents d{"\u00e9"}tect{"\u00e9"}</div>
            ) : (
              <div className="space-y-2">
                {suspiciousAgents.slice(0, 10).map(([agent, count], i) => {
                  const risk = count >= 4 ? 'critical' : count >= 3 ? 'warning' : 'elevated';
                  const color = STATUS_COLORS[risk];
                  const label = risk === 'critical' ? 'CRITIQUE' : risk === 'warning' ? '\u00c9LEV\u00c9' : 'MOD\u00c9R\u00c9';
                  return (
                    <motion.div key={agent} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${color}` }}>
                      <div>
                        <span className="text-xs font-semibold text-white">{agent}</span>
                        <span className="text-xs text-muted ml-2">{count} retards constat{"\u00e9"}s</span>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{label}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-[10px] text-red-400/80">
                <strong>{"\u26a0\ufe0f"} Indicateur de corruption potentielle :</strong> Les agents avec {"\u2265"}3 retards r{"\u00e9"}currents sur des d{"\u00e9"}clarations {"\u00e0"} haute valeur
                doivent faire l{"'"}objet d{"'"}un audit interne. Un pattern de retards cibl{"\u00e9"}s peut indiquer des arrangements avec des op{"\u00e9"}rateurs {"\u00e9"}conomiques.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>

      <FadeIn>
        <div className="card">
          <SectionTitle icon={"\ud83d\udccb"}>D{"\u00e9"}clarations avec D{"\u00e9"}lais Anormaux {"\u2014"} D{"\u00e9"}tail Complet</SectionTitle>
          <PaginatedTable
            headers={
              <tr>
                <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">D{"\u00e9"}claration</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Importateur</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Bureau</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Retard</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Valeur CIF</th>
                <th className="text-center text-xs font-semibold text-slate-400 px-3 py-2">Risque</th>
              </tr>
            }
            rows={delays.map((d: any, i: number) => {
              const hours = d.delay_hours || d.hours || 0;
              const risk = hours > 72 ? 'critical' : hours > 48 ? 'warning' : 'elevated';
              const color = STATUS_COLORS[risk];
              const label = risk === 'critical' ? 'CRITIQUE' : risk === 'warning' ? '\u00c9LEV\u00c9' : 'MOD\u00c9R\u00c9';
              return (
                <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2"><span className="text-xs font-bold text-white">{d.declaration_id || d.sgd_ref || `SGD-${i}`}</span></td>
                  <td className="px-3 py-2"><span className="text-xs text-slate-300">{d.importer_name || d.importer_id || 'N/A'}</span></td>
                  <td className="px-3 py-2"><span className="text-xs text-slate-400">{d.office_name || d.office_id || d.bureau || 'N/A'}</span></td>
                  <td className="px-3 py-2 text-right"><span className="text-xs font-black" style={{ color }}>{hours}h</span></td>
                  <td className="px-3 py-2 text-right"><span className="text-xs text-slate-300">{fmtM(d.cif_value || d.value || 0)}</span></td>
                  <td className="px-3 py-2 text-center"><span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{label}</span></td>
                </motion.tr>
              );
            })}
          />
        </div>
      </FadeIn>
    </div>
  );
};

export default DelaysPage;
