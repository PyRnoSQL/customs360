import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { motion } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, PaginatedTable } from '../components/UI';
import { fmtM, fmt } from '../services/api';

const TT = {
  contentStyle: { background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9', fontSize: 12 },
  labelStyle: { color: '#94a3b8', fontSize: 11 },
};
const SC: Record<string,string> = { critical:'#ef4444', warning:'#f59e0b', elevated:'#f97316', normal:'#10b981' };

const DelaysPage = () => {
  const { data, loading, error } = useApi<any>('fraud');
  const [selBureau, setSelBureau] = useState<string|null>(null);

  const a = useMemo(() => {
    if (!data) return null;
    const dl = data.delays || [];
    const causes = data.delay_causes || [];
    const n = dl.length;
    const avgH = n > 0 ? Math.round(dl.reduce((s:number,d:any) => s+(d.delay_hours||d.hours||0),0)/n) : 0;
    const crit = dl.filter((d:any) => (d.delay_hours||d.hours||0) > 72).length;
    const critPct = n > 0 ? Math.round((crit/n)*100) : 0;

    const byB: Record<string,{count:number;totalH:number}> = {};
    dl.forEach((d:any) => {
      const b = d.office_name||d.office_id||d.bureau||'Inconnu';
      if (!byB[b]) byB[b] = {count:0,totalH:0};
      byB[b].count++; byB[b].totalH += (d.delay_hours||d.hours||0);
    });
    const bureauRank = Object.entries(byB)
      .map(([name,v]) => ({name, count:v.count, avgH:Math.round(v.totalH/v.count)}))
      .sort((a,b) => b.avgH - a.avgH);

    const byAg: Record<string,number> = {};
    dl.forEach((d:any) => { const ag = d.declarant_name||d.agent_name||d.declarant_id||'Inconnu'; byAg[ag] = (byAg[ag]||0)+1; });
    const susAg = Object.entries(byAg).filter(([,c]) => c >= 2).sort(([,a],[,b]) => b-a);

    const causeData = causes.length > 0
      ? causes.map((c:any) => ({
          name: c.cause||c.name||c.label||'Autre',
          value: c.count||c.value||c.total||1,
          fill: (c.cause||c.name||'').includes('rification') ? '#3b82f6'
            : (c.cause||c.name||'').includes('Conformit') ? '#f59e0b'
            : (c.cause||c.name||'').includes('Paiement') ? '#ef4444'
            : (c.cause||c.name||'').includes('Douanier') ? '#f97316' : '#8b5cf6',
        }))
      : bureauRank.slice(0,6).map(b => ({
          name:b.name, value:b.count, fill: b.avgH>72?'#ef4444':b.avgH>48?'#f59e0b':'#3b82f6' }));

    const scatter = dl.map((d:any,i:number) => ({
      x:i, y:d.delay_hours||d.hours||0, z:d.cif_value||d.value||1e6,
      name:d.declaration_id||d.sgd_ref||'SGD-'+i,
      status:(d.delay_hours||d.hours||0)>72?'critical':(d.delay_hours||d.hours||0)>48?'warning':'normal',
    }));
    return {dl,n,avgH,crit,critPct,bureauRank,susAg,causeData,scatter};
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!a) return <ErrorBox message="Aucune donn&#233;e disponible" />;

  return (
    <div className="space-y-6">
      <PageHeader title="D&#233;lais Suspects" subtitle="Monitoring des anomalies de d&#233;lais &#8212; Blocages, retards injustifi&#233;s et sch&#233;mas suspects" icon="&#9201;&#65039;" />

      <FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="D&#233;clarations en retard" value={a.n} icon="&#9888;&#65039;" color="#f59e0b" />
          <KPICard label="D&#233;lai moyen" value={`${a.avgH}h`} icon="&#9201;&#65039;" color="#3b82f6" />
          <KPICard label="Cas critiques (>72h)" value={a.crit} icon="&#128308;" color="#ef4444" sub={`${a.critPct}% du total`} />
          <KPICard label="Agents r&#233;currents" value={a.susAg.length} icon="&#128373;&#65039;" color="#8b5cf6" sub="&#8805;2 retards" />
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FadeIn>
          <div className="card">
            <SectionTitle icon="&#128202;">Distribution des Retards &#8212; Heures par D&#233;claration</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{top:8,right:16,bottom:8,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" dataKey="x" name="Index" tick={{fill:'#64748b',fontSize:9}} label={{value:'D&#233;clarations',position:'insideBottom',offset:-4,fill:'#64748b',fontSize:9}} />
                <YAxis type="number" dataKey="y" name="Heures" tick={{fill:'#64748b',fontSize:9}} label={{value:'Heures de retard',angle:-90,position:'insideLeft',fill:'#64748b',fontSize:9}} />
                <ZAxis type="number" dataKey="z" range={[30,200]} />
                <Tooltip {...TT} />
                <Scatter data={a.scatter} isAnimationActive animationDuration={1200}>
                  {a.scatter.map((d:any,i:number) => <Cell key={i} fill={SC[d.status]||'#3b82f6'} fillOpacity={0.7} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {[['Normal (<48h)','#10b981'],['&#201;lev&#233; (48-72h)','#f59e0b'],['Critique (>72h)','#ef4444']].map(([l,c]) => (
                <span key={l} className="flex items-center gap-1.5 text-xs text-muted"><span className="w-2 h-2 rounded-full" style={{background:c as string}} />{l}</span>
              ))}
            </div>
          </div>
        </FadeIn>
        <FadeIn>
          <div className="card">
            <SectionTitle icon="&#128300;">Classificateur de Causes &#8212; D&#233;lais de D&#233;douanement</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={a.causeData} layout="vertical" margin={{top:4,right:40,left:8,bottom:4}} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{fill:'#94a3b8',fontSize:9}} />
                <YAxis type="category" dataKey="name" tick={{fill:'#cbd5e1',fontSize:10}} width={120} />
                <Tooltip {...TT} />
                <Bar dataKey="value" name="Occurrences" radius={[0,4,4,0]} isAnimationActive animationDuration={1000}>
                  {a.causeData.map((d:any,i:number) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FadeIn>
          <div className="card">
            <SectionTitle icon="&#127963;&#65039;">Bureaux les Plus Lents &#8212; D&#233;lai Moyen</SectionTitle>
            <div className="space-y-2">
              {a.bureauRank.slice(0,8).map((b,i) => {
                const maxH = a.bureauRank[0]?.avgH||1;
                const pct = Math.round((b.avgH/maxH)*100);
                const color = b.avgH>72?'#ef4444':b.avgH>48?'#f59e0b':'#3b82f6';
                return (
                  <motion.div key={b.name} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
                    className="flex items-center gap-3 cursor-pointer hover:bg-white/[0.02] rounded-lg p-2 -mx-2 transition-colors"
                    onClick={() => setSelBureau(selBureau===b.name?null:b.name)}>
                    <span className="text-xs font-bold w-6 text-center" style={{color}}>#{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-semibold text-white truncate">{b.name}</span>
                        <span className="text-xs font-black" style={{color}}>{b.avgH}h moy.</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                        <motion.div className="h-full rounded-full" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8,delay:i*0.05}} style={{background:color}} />
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
            <SectionTitle icon="&#128373;&#65039;">Agents avec Retards R&#233;currents &#8212; Sch&#233;mas Suspects</SectionTitle>
            {a.susAg.length === 0
              ? <div className="h-48 flex items-center justify-center text-muted text-sm">Aucun agent avec retards r&#233;currents d&#233;tect&#233;</div>
              : <div className="space-y-2">
                  {a.susAg.slice(0,10).map(([agent,count],i) => {
                    const risk = count>=4?'critical':count>=3?'warning':'elevated';
                    const color = SC[risk];
                    const label = risk==='critical'?'CRITIQUE':risk==='warning'?'&#201;LEV&#201;':'MOD&#201;R&#201;';
                    return (
                      <motion.div key={agent} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
                        className="flex items-center justify-between p-2 rounded-lg" style={{background:'rgba(255,255,255,0.02)',borderLeft:`3px solid ${color}`}}>
                        <div>
                          <span className="text-xs font-semibold text-white">{agent}</span>
                          <span className="text-xs text-muted ml-2">{count} retards</span>
                        </div>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:`${color}20`,color}}>{label}</span>
                      </motion.div>
                    );
                  })}
                </div>
            }
            <div className="mt-4 p-3 rounded-lg" style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)'}}>
              <p className="text-[10px] text-red-400/80">
                <strong>&#9888;&#65039; Indicateur de corruption potentielle :</strong> Les agents avec &#8805;3 retards r&#233;currents sur des d&#233;clarations &#224; haute valeur doivent faire l&#39;objet d&#39;un audit interne.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>

      <FadeIn>
        <div className="card">
          <SectionTitle icon="&#128203;">D&#233;clarations avec D&#233;lais Anormaux &#8212; D&#233;tail Complet</SectionTitle>
          <PaginatedTable
            headers={<tr>
              <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">D&#233;claration</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Importateur</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Bureau</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Retard</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Valeur CIF</th>
              <th className="text-center text-xs font-semibold text-slate-400 px-3 py-2">Risque</th>
            </tr>}
            rows={a.dl.map((d:any,i:number) => {
              const h = d.delay_hours||d.hours||0;
              const risk = h>72?'critical':h>48?'warning':'elevated';
              const color = SC[risk];
              const lbl = risk==='critical'?'CRITIQUE':risk==='warning'?'&#201;LEV&#201;':'MOD&#201;R&#201;';
              return (
                <motion.tr key={i} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2"><span className="text-xs font-bold text-white">{d.declaration_id||d.sgd_ref||'SGD-'+i}</span></td>
                  <td className="px-3 py-2"><span className="text-xs text-slate-300">{d.importer_name||d.importer_id||'N/A'}</span></td>
                  <td className="px-3 py-2"><span className="text-xs text-slate-400">{d.office_name||d.office_id||d.bureau||'N/A'}</span></td>
                  <td className="px-3 py-2 text-right"><span className="text-xs font-black" style={{color}}>{h}h</span></td>
                  <td className="px-3 py-2 text-right"><span className="text-xs text-slate-300">{fmtM(d.cif_value||d.value||0)}</span></td>
                  <td className="px-3 py-2 text-center"><span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:`${color}20`,color}}>{lbl}</span></td>
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
