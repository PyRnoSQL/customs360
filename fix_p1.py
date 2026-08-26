import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

print("=" * 50)
print("CUSTOMS360 — Priority 1 Fix")
print("=" * 50)

# ── 1. DELAYS.TSX ──────────────────────────────────
print("\n[1/3] Writing Delays.tsx...")

with open('frontend/src/pages/Delays.tsx', 'w', encoding='utf-8') as f:
    f.write(r"""import React, { useState, useMemo } from 'react';
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
""")
print("  OK - Delays.tsx written")


# ── 2. DOUANIERS.TSX ──────────────────────────────
print("\n[2/3] Writing Douaniers.tsx...")

with open('frontend/src/pages/Douaniers.tsx', 'w', encoding='utf-8') as f:
    f.write(r"""import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, PaginatedTable } from '../components/UI';
import { fmtM, fmt } from '../services/api';

const TT = {
  contentStyle: { background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#f1f5f9', fontSize: 12 },
  labelStyle: { color: '#94a3b8', fontSize: 11 },
};
const SM: Record<string,{label:string;color:string;bg:string}> = {
  ACTIF:               {label:'ACTIF',         color:'#10b981',bg:'rgba(16,185,129,0.12)'},
  ELIGIBLE_PROMOTION:  {label:'&#201;LIGIBLE PROMO',color:'#3b82f6',bg:'rgba(59,130,246,0.12)'},
  ALERTE_SURMENAGE:    {label:'SURMENAGE',     color:'#f59e0b',bg:'rgba(245,158,11,0.12)'},
  RISQUE_REDEPLOIEMENT:{label:'RED&#201;PLOIEMENT', color:'#ef4444',bg:'rgba(239,68,68,0.12)'},
};

const DouaniersPage = () => {
  const { data, loading, error } = useApi<any>('officers');
  const [sel, setSel] = useState<any>(null);
  const [fB, setFB] = useState('all');
  const [fS, setFS] = useState('all');
  const [q, setQ] = useState('');

  const a = useMemo(() => {
    if (!data?.officers) return null;
    const off = data.officers as any[];
    const n = off.length;
    const actifs = off.filter((o:any) => o.career_status==='ACTIF').length;
    const surm = off.filter((o:any) => o.career_status==='ALERTE_SURMENAGE'||o.burnout_risk==='HIGH').length;
    const tDecl = off.reduce((s:number,o:any) => s+(o.total_declarations||0),0);
    const avgCl = n>0 ? Math.round(off.reduce((s:number,o:any) => s+(o.avg_clearance_hours||0),0)/n) : 0;
    const bx = new Set<string>(); off.forEach((o:any) => (o.bureau_ids||[]).forEach((b:string) => bx.add(b)));
    const byB: Record<string,{agents:number;decls:number}> = {};
    off.forEach((o:any) => {
      (o.bureau_ids||['N/A']).forEach((b:string) => {
        if (!byB[b]) byB[b]={agents:0,decls:0};
        byB[b].agents++; byB[b].decls+=o.total_declarations||0;
      });
    });
    const bWork = Object.entries(byB).map(([name,v]) => ({name,...v,avgDecl:v.agents>0?Math.round(v.decls/v.agents):0})).sort((a,b) => b.decls-a.decls);
    return {off,n,actifs,surm,tDecl,avgCl,bureaux:Array.from(bx).sort(),bWork};
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!a) return <ErrorBox message="Aucune donn&#233;e disponible" />;

  const filtered = a.off.filter((o:any) => {
    if (fB!=='all' && !(o.bureau_ids||[]).includes(fB)) return false;
    if (fS!=='all' && o.career_status!==fS) return false;
    if (q && !o.name?.toLowerCase().includes(q.toLowerCase()) && !o.officer_id?.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Douaniers" subtitle="Gestion op&#233;rationnelle des agents &#8212; Assignation, contr&#244;les et indicateurs quotidiens" icon="&#128110;" />
      <FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard label="Agents enregistr&#233;s" value={a.n} icon="&#128100;" color="#3b82f6" />
          <KPICard label="Agents actifs" value={a.actifs} icon="&#9989;" color="#10b981" sub={`${a.n>0?Math.round((a.actifs/a.n)*100):0}%`} />
          <KPICard label="Alerte surmenage" value={a.surm} icon="&#9888;&#65039;" color="#f59e0b" />
          <KPICard label="Contr&#244;les r&#233;alis&#233;s" value={fmt(a.tDecl)} icon="&#128203;" color="#8b5cf6" />
          <KPICard label="D&#233;lai moyen" value={`${a.avgCl}h`} icon="&#9201;&#65039;" color="#06b6d4" />
        </div>
      </FadeIn>
      <FadeIn>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Rechercher un agent..." value={q} onChange={e => setQ(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 w-48 focus:outline-none focus:border-blue-500/50" />
          <select value={fB} onChange={e => setFB(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="all">Tous les bureaux</option>
            {a.bureaux.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={fS} onChange={e => setFS(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="all">Tous les statuts</option>
            {Object.entries(SM).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-xs text-muted ml-auto">{filtered.length} agent{filtered.length>1?'s':''}</span>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FadeIn>
          <div className="card">
            <SectionTitle icon="&#127963;&#65039;">Charge de Travail par Bureau &#8212; D&#233;clarations / Agent</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={a.bWork.slice(0,8)} layout="vertical" margin={{top:4,right:40,left:8,bottom:4}} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{fill:'#94a3b8',fontSize:9}} />
                <YAxis type="category" dataKey="name" tick={{fill:'#cbd5e1',fontSize:10}} width={80} />
                <Tooltip {...TT} />
                <Bar dataKey="avgDecl" name="D&#233;cl./Agent" radius={[0,4,4,0]} isAnimationActive animationDuration={1000}>
                  {a.bWork.slice(0,8).map((b,i) => <Cell key={i} fill={b.avgDecl>50?'#ef4444':b.avgDecl>30?'#f59e0b':'#3b82f6'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>
        <FadeIn>
          <div className="card">
            <SectionTitle icon="&#128202;">R&#233;partition des Statuts &#8212; Vue Op&#233;rationnelle</SectionTitle>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {Object.entries(SM).map(([key,{label,color,bg}]) => {
                const count = a.off.filter((o:any) => o.career_status===key).length;
                const pct = a.n>0?Math.round((count/a.n)*100):0;
                return (
                  <motion.div key={key} whileHover={{scale:1.02}} className="p-4 rounded-xl cursor-pointer transition-all"
                    style={{background:bg,border:`1px solid ${color}30`}} onClick={() => setFS(fS===key?'all':key)}>
                    <div className="text-2xl font-black mb-1" style={{color}}>{count}</div>
                    <div className="text-xs font-semibold text-white mb-1">{label}</div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
                      <motion.div className="h-full rounded-full" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8}} style={{background:color}} />
                    </div>
                    <div className="text-[10px] text-muted mt-1">{pct}%</div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </div>

      <FadeIn>
        <div className="card">
          <SectionTitle icon="&#128203;">Liste des Agents &#8212; Assignation & Indicateurs Op&#233;rationnels</SectionTitle>
          <PaginatedTable
            headers={<tr>
              <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Agent</th>
              <th className="text-left text-xs font-semibold text-slate-400 px-3 py-2">Bureau(x)</th>
              <th className="text-center text-xs font-semibold text-slate-400 px-3 py-2">Statut</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">D&#233;cl.</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Fraudes</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Taux</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">D&#233;lai</th>
              <th className="text-right text-xs font-semibold text-slate-400 px-3 py-2">Recettes</th>
              <th className="text-center text-xs font-semibold text-slate-400 px-3 py-2">Fiche</th>
            </tr>}
            rows={filtered.map((o:any,i:number) => {
              const st = SM[o.career_status]||SM.ACTIF;
              const dr = (o.fraud_detection_rate*100).toFixed(1);
              const dc = o.avg_clearance_hours > o.bureau_baseline_hours*1.3 ? '#ef4444' : o.avg_clearance_hours > o.bureau_baseline_hours ? '#f59e0b' : '#10b981';
              return (
                <motion.tr key={o.officer_id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.02}}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2"><div className="text-xs font-bold text-white">{o.name}</div><div className="text-[10px] text-slate-500">{o.officer_id}</div></td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{(o.bureau_ids||[]).map((b:string) => <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300">{b}</span>)}</div></td>
                  <td className="px-3 py-2 text-center"><span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:st.bg,color:st.color}}>{st.label}</span></td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-white">{fmt(o.total_declarations)}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-red-400">{o.fraud_detected}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold" style={{color:parseFloat(dr)>30?'#10b981':parseFloat(dr)>15?'#f59e0b':'#ef4444'}}>{dr}%</td>
                  <td className="px-3 py-2 text-right"><span className="text-xs font-semibold" style={{color:dc}}>{o.avg_clearance_hours}h</span><span className="text-[10px] text-muted"> /{o.bureau_baseline_hours}h</span></td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">{fmtM(o.revenue_recovered)}</td>
                  <td className="px-3 py-2 text-center"><motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={() => setSel(o)}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10">Voir &#8594;</motion.button></td>
                </motion.tr>
              );
            })}
          />
        </div>
      </FadeIn>

      <AnimatePresence>
        {sel && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(8px)'}} onClick={() => setSel(null)}>
            <motion.div initial={{scale:0.9,y:20}} animate={{scale:1,y:0}} exit={{scale:0.9,y:20}}
              className="card max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div><h3 className="text-base font-black text-white">{sel.name}</h3><p className="text-xs text-muted">{sel.officer_id} &#183; {(sel.bureau_ids||[]).join(', ')}</p></div>
                <button onClick={() => setSel(null)} className="text-slate-400 hover:text-white text-lg">&#10005;</button>
              </div>
              <div className="space-y-2">
                {[
                  ['D&#233;clarations trait&#233;es',fmt(sel.total_declarations)],
                  ['Fraudes d&#233;tect&#233;es',String(sel.fraud_detected)],
                  ['Taux de d&#233;tection',(sel.fraud_detection_rate*100).toFixed(1)+'%'],
                  ['D&#233;lai moyen',sel.avg_clearance_hours+'h vs '+sel.bureau_baseline_hours+'h'],
                  ['Recettes recouvr&#233;es',fmtM(sel.revenue_recovered)+' FCFA'],
                  ['Rang bureau','#'+sel.rank_in_bureau+'/'+sel.total_in_bureau],
                  ['Risque surmenage',sel.burnout_risk],
                  ['Statut',(SM[sel.career_status]||SM.ACTIF).label],
                ].map(([k,v]) => (
                  <div key={k as string} className="flex justify-between py-1.5" style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <span className="text-xs text-muted">{k}</span><span className="text-xs font-semibold text-white">{v}</span>
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
""")
print("  OK - Douaniers.tsx written")


# ── 3. PATCH APP.TSX ──────────────────────────────
print("\n[3/3] Patching App.tsx...")

with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

ch = 0

# 3a. Replace Delays import
old_imp = "import Delays from './pages/Delays';"
new_imp = "import DelaysPage from './pages/Delays';"
if old_imp in app:
    app = app.replace(old_imp, new_imp, 1)
    ch += 1
    print("  Replaced Delays import -> DelaysPage")

# 3b. Add DouaniersPage import
if 'Douaniers' not in app:
    anchor = "import OfficersPage from './pages/Officers';"
    if anchor in app:
        app = app.replace(anchor, anchor + "\nimport DouaniersPage from './pages/Douaniers';", 1)
        ch += 1
        print("  Added DouaniersPage import")

# 3c. Add Predictions import if missing
if 'Predictions' not in app:
    anchor2 = "import GraphPage from './pages/GraphPage';"
    if anchor2 in app:
        app = app.replace(anchor2, anchor2 + "\nimport Predictions from './pages/Predictions';", 1)
        ch += 1
        print("  Added Predictions import")

# 3d. Add Douaniers to nav array
offices_nav = "{ path: '/offices',     icon: '\U0001f3db\ufe0f', label: 'Secteurs Douaniers',    group: 'OP\u00c9RATIONS',   navKey: 'offices'      },"
if '/douaniers' not in app and offices_nav in app:
    douaniers_entry = "\n  { path: '/douaniers',   icon: '\U0001f46e', label: 'Douaniers',             group: 'OP\u00c9RATIONS',   navKey: 'douaniers'    },"
    app = app.replace(offices_nav, offices_nav + douaniers_entry, 1)
    ch += 1
    print("  Added Douaniers to nav array")

# 3e. Add Predictions to nav array (INTELLIGENCE group)
graph_nav = "{ path: '/graph',       icon: '\U0001f578\ufe0f', label: 'Graphe DATE',          group: 'INTELLIGENCE', navKey: 'graph'        },"
if '/predictions' not in app and graph_nav in app:
    pred_entry = "\n  { path: '/predictions', icon: '\U0001f52e', label: 'Pr\u00e9dictions IA',       group: 'INTELLIGENCE', navKey: 'predictions'  },"
    app = app.replace(graph_nav, graph_nav + pred_entry, 1)
    ch += 1
    print("  Added Predictions IA to nav array")

# 3f. Fix delays route
old_route = "element={<Delays      key={sgdCount} />}"
new_route = "element={<DelaysPage  key={sgdCount} />}"
if old_route in app:
    app = app.replace(old_route, new_route, 1)
    ch += 1
    print("  Fixed delays route -> DelaysPage")

# 3g. Add /douaniers route
offices_route = '<Route path="/offices"   element={<ProtectedRoute path="/offices"   element={<Offices     key={sgdCount} />} />} />'
if '/douaniers' not in app and offices_route in app:
    d_route = '\n            <Route path="/douaniers" element={<ProtectedRoute path="/douaniers" element={<DouaniersPage key={sgdCount} />} />} />'
    app = app.replace(offices_route, offices_route + d_route, 1)
    ch += 1
    print("  Added /douaniers route")

# 3h. Add /predictions route
graph_route = '<Route path="/graph"     element={<ProtectedRoute path="/graph"     element={<GraphPage   key={sgdCount} />} />} />'
if '/predictions' not in app and graph_route in app:
    p_route = '\n            <Route path="/predictions" element={<ProtectedRoute path="/predictions" element={<Predictions key={sgdCount} />} />} />'
    app = app.replace(graph_route, graph_route + p_route, 1)
    ch += 1
    print("  Added /predictions route")

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)

print(f"\n  App.tsx: {ch} changes applied")
print("\n" + "=" * 50)
print("ALL DONE")
print("=" * 50)
print("\nRun:")
print("  npm run build --prefix frontend 2>&1 | tail -10")
print("  git add -A")
print('  git commit -m "feat: P1 - Delays+Douaniers+Predictions pages"')
print("  git push")
