import React, { useState, useMemo } from 'react';
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
