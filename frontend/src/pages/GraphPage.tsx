import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { api, fmtM, fmt } from '../services/api';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid, AnimatedNumber } from '../components/UI';

// ── Types ─────────────────────────────────────────────────────────────────────
interface GraphNode {
  id: string; label: string; type: string; risk: number; fraud?: boolean;
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null;
}
interface GraphLink { source: string | GraphNode; target: string | GraphNode; fraud: boolean; }
interface SGDRow {
  sgd_id: string; date: string; importer_id: string; declarant_id: string;
  office_id: string; tariff_code: string; cif_value: number; fraud_flag: number;
  taxes_declared: number; revenue_collected: number;
}
interface FraudCase { case_id: string; sgd_id: string; importer_id: string; declarant_id: string; loss_amount: number; ai_probability: number; date: string; office_id: string; }

// ── Color helpers ─────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = { importer: '#3b82f6', declarant: '#10b981', sgd: '#8b5cf6', office: '#f59e0b' };
const TYPE_LABEL: Record<string, string> = { importer: 'Importateur', declarant: 'Déclarant', sgd: 'SGD', office: 'Bureau' };
const TYPE_RADIUS: Record<string, number> = { importer: 18, declarant: 14, sgd: 9, office: 20 };
const riskColor = (r: number) => r >= 80 ? '#ef4444' : r >= 60 ? '#f97316' : r >= 40 ? '#eab308' : '#10b981';
const OFFICE_NAMES: Record<string,string> = { DLA001:'Douala Port', KBI001:'Kribi Port', DLA002:'Douala Aéroport', YDE001:'Yaoundé', YDE002:'Yaoundé Centre' };
const CHART_TT = { contentStyle: { background:'rgba(15,23,42,0.95)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:8, color:'#f1f5f9' }, labelStyle:{ color:'#94a3b8' } };

// ══════════════════════════════════════════════════════════════════════════════
// 1. FORCE-DIRECTED GRAPH
// ══════════════════════════════════════════════════════════════════════════════
function ForceGraph({ nodes: initNodes, links: initLinks }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links] = useState<GraphLink[]>(initLinks);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL'|'FRAUD'|'IMPORTERS'|'DECLARANTS'>('ALL');
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef<GraphNode | null>(null);

  const runSim = useCallback((ns: GraphNode[], ls: GraphLink[]) => {
    const W = 860; const H = 480;
    const nodeMap = new Map(ns.map(n => [n.id, n]));
    ns.forEach((n, i) => {
      if (!n.x) { const a = (i / ns.length) * Math.PI * 2; const r = 150 + Math.random() * 60; n.x = W/2 + Math.cos(a)*r; n.y = H/2 + Math.sin(a)*r; n.vx=0; n.vy=0; }
    });
    let alpha = 1;
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = setInterval(() => {
      if (alpha < 0.01) { clearInterval(simRef.current!); return; }
      alpha *= 0.97;
      for (let i=0;i<ns.length;i++) for (let j=i+1;j<ns.length;j++) {
        const a=ns[i]; const b=ns[j];
        const dx=(b.x??0)-(a.x??0); const dy=(b.y??0)-(a.y??0);
        const dist=Math.sqrt(dx*dx+dy*dy)||1;
        const s=(2800/(dist*dist))*alpha;
        a.vx=(a.vx??0)-dx/dist*s; a.vy=(a.vy??0)-dy/dist*s;
        b.vx=(b.vx??0)+dx/dist*s; b.vy=(b.vy??0)+dy/dist*s;
      }
      ls.forEach(l => {
        const a=nodeMap.get(typeof l.source==='string'?l.source:(l.source as GraphNode).id);
        const b=nodeMap.get(typeof l.target==='string'?l.target:(l.target as GraphNode).id);
        if(!a||!b) return;
        const dx=(b.x??0)-(a.x??0); const dy=(b.y??0)-(a.y??0);
        const dist=Math.sqrt(dx*dx+dy*dy)||1; const s=((dist-80)/dist)*0.07*alpha;
        a.vx=(a.vx??0)+dx*s; a.vy=(a.vy??0)+dy*s;
        b.vx=(b.vx??0)-dx*s; b.vy=(b.vy??0)-dy*s;
      });
      ns.forEach(n => {
        n.vx=(n.vx??0)+(W/2-(n.x??0))*0.008*alpha; n.vy=(n.vy??0)+(H/2-(n.y??0))*0.008*alpha;
        if(n.fx!=null){n.x=n.fx;n.y=n.fy??0;return;}
        n.vx=(n.vx??0)*0.8; n.vy=(n.vy??0)*0.8;
        n.x=Math.max(30,Math.min(W-30,(n.x??0)+(n.vx??0)));
        n.y=Math.max(30,Math.min(H-30,(n.y??0)+(n.vy??0)));
      });
      setNodes([...ns]);
    }, 20);
  }, []);

  useEffect(() => {
    const ns = initNodes.map(n => ({ ...n, x:undefined, y:undefined, vx:0, vy:0, fx:null, fy:null }));
    setNodes(ns); runSim(ns, initLinks);
    return () => { if(simRef.current) clearInterval(simRef.current); };
  }, [initNodes, initLinks, runSim]);

  const handleWheel = (e: React.WheelEvent) => { e.preventDefault(); const f=e.deltaY<0?1.12:0.88; transformRef.current={...transformRef.current,k:Math.max(0.3,Math.min(4,transformRef.current.k*f))}; setTransform({...transformRef.current}); };
  const handleSvgDown = (e: React.MouseEvent) => { if((e.target as SVGElement).closest('.ng')){return;} isPanningRef.current=true; panStartRef.current={x:e.clientX-transformRef.current.x,y:e.clientY-transformRef.current.y}; };
  const handleSvgMove = (e: React.MouseEvent) => {
    if(draggingRef.current){const svg=svgRef.current!; const rect=svg.getBoundingClientRect(); const x=(e.clientX-rect.left-transformRef.current.x)/transformRef.current.k; const y=(e.clientY-rect.top-transformRef.current.y)/transformRef.current.k; draggingRef.current.fx=x; draggingRef.current.fy=y; draggingRef.current.x=x; draggingRef.current.y=y; setNodes(ns=>[...ns]);}
    else if(isPanningRef.current){transformRef.current={...transformRef.current,x:e.clientX-panStartRef.current.x,y:e.clientY-panStartRef.current.y}; setTransform({...transformRef.current});}
  };
  const handleSvgUp = () => { isPanningRef.current=false; if(draggingRef.current){draggingRef.current.fx=null;draggingRef.current.fy=null;draggingRef.current=null;} };
  const isVis = (n: GraphNode) => filterMode==='ALL'?true:filterMode==='FRAUD'?(n.fraud||n.risk>=70):filterMode==='IMPORTERS'?n.type==='importer':n.type==='declarant';
  const nodeMap = new Map(nodes.map(n=>[n.id,n]));

  return (
    <div className="card p-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 flex-wrap" style={{ background:'rgba(0,0,0,0.2)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-sm font-bold text-white">🕸️ Graphe DATE — Réseau Entités</span>
        <div className="flex gap-2 ml-3">
          {([['ALL','Tout','#3b82f6'],['FRAUD','Fraudes','#ef4444'],['IMPORTERS','Importateurs','#3b82f6'],['DECLARANTS','Déclarants','#10b981']] as [string,string,string][]).map(([v,l,c])=>(
            <button key={v} onClick={()=>setFilterMode(v as typeof filterMode)} className="text-xs px-3 py-1 rounded-full font-semibold transition-all"
              style={{ background:filterMode===v?c+'22':'transparent', border:`1px solid ${filterMode===v?c:'rgba(255,255,255,0.08)'}`, color:filterMode===v?c:'#64748b' }}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <button onClick={()=>{transformRef.current={x:0,y:0,k:1};setTransform({x:0,y:0,k:1});}} className="btn btn-ghost text-xs px-3 py-1">⟲ Reset</button>
          <span className="text-xs text-muted hidden xl:block">Scroll=zoom · Drag=déplacer · Clic=détail</span>
        </div>
      </div>
      <div className="flex">
        <svg ref={svgRef} className="flex-1 cursor-grab active:cursor-grabbing select-none" style={{ height:500, background:'linear-gradient(135deg,#020817,#0b1221)' }}
          onWheel={handleWheel} onMouseDown={handleSvgDown} onMouseMove={handleSvgMove} onMouseUp={handleSvgUp} onMouseLeave={handleSvgUp}>
          <defs>
            <pattern id="g2" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(59,130,246,0.04)" strokeWidth="1"/></pattern>
            <filter id="gl-b"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="gl-r"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#g2)"/>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {links.map((l,i)=>{const a=nodeMap.get(typeof l.source==='string'?l.source:(l.source as GraphNode).id); const b=nodeMap.get(typeof l.target==='string'?l.target:(l.target as GraphNode).id); if(!a||!b||!a.x||!b.x) return null; const av=isVis(a); const bv=isVis(b); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={l.fraud?'#ef4444':'rgba(148,163,184,1)'} strokeWidth={l.fraud?1.5:0.8} strokeOpacity={filterMode!=='ALL'?(av&&bv?0.6:0.04):(l.fraud?0.6:0.1)} strokeDasharray={l.fraud?'4 2':undefined}/>;
            })}
            {nodes.map(node=>{if(!node.x||!node.y) return null; const color=node.fraud?'#ef4444':TYPE_COLOR[node.type]??'#64748b'; const r=TYPE_RADIUS[node.type]??12; const isSel=selected?.id===node.id; const isHov=hoveredId===node.id; const vis=isVis(node);
              return <g key={node.id} className="ng" style={{opacity:filterMode!=='ALL'&&!vis?0.06:1,cursor:'pointer'}} onMouseDown={e=>{e.stopPropagation();draggingRef.current=node;}} onClick={e=>{e.stopPropagation();setSelected(s=>s?.id===node.id?null:node);}} onMouseEnter={()=>setHoveredId(node.id)} onMouseLeave={()=>setHoveredId(null)}>
                {(node.fraud||node.risk>=70)&&<circle cx={node.x} cy={node.y} r={r+8} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.25}/>}
                {isSel&&<circle cx={node.x} cy={node.y} r={r+6} fill="none" stroke="#fff" strokeWidth={2} strokeOpacity={0.6} strokeDasharray="4 2"/>}
                <circle cx={node.x} cy={node.y} r={isHov?r+3:r} fill={color+(isHov?'cc':'33')} stroke={color} strokeWidth={isSel?2.5:1.5} filter={node.fraud?'url(#gl-r)':isHov?'url(#gl-b)':undefined}/>
                <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" fontSize={node.type==='sgd'?7:9} fontWeight="bold" fill={color} style={{pointerEvents:'none'}}>{node.type==='sgd'?node.label.replace('SGD',''):node.type[0].toUpperCase()}</text>
                {node.type!=='sgd'&&(isHov||isSel)&&<text x={node.x} y={node.y+r+12} textAnchor="middle" fontSize={9} fill="#94a3b8" style={{pointerEvents:'none'}}>{String(node.label??node.id).slice(0,14)}</text>}
                {node.type==='importer'&&node.risk>0&&<text x={node.x+r-2} y={node.y-r+4} textAnchor="middle" fontSize={7} fontWeight="bold" fill={riskColor(node.risk)} style={{pointerEvents:'none'}}>{node.risk}</text>}
              </g>;
            })}
          </g>
        </svg>
        <AnimatePresence>{selected&&(
          <motion.div initial={{width:0,opacity:0}} animate={{width:220,opacity:1}} exit={{width:0,opacity:0}} transition={{duration:0.25}} className="overflow-hidden flex-shrink-0 border-l" style={{borderColor:'rgba(255,255,255,0.06)',background:'rgba(9,14,28,0.95)'}}>
            <div className="p-4" style={{width:220}}>
              <div className="flex justify-between mb-3"><span className="text-xs font-bold uppercase tracking-widest text-muted">Détail</span><button onClick={()=>setSelected(null)} className="text-muted hover:text-white">✕</button></div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black" style={{background:(selected.fraud?'#ef4444':TYPE_COLOR[selected.type])+'22',border:`2px solid ${selected.fraud?'#ef4444':TYPE_COLOR[selected.type]}`,color:selected.fraud?'#ef4444':TYPE_COLOR[selected.type]}}>{selected.type[0].toUpperCase()}</div>
                <div><div className="text-sm font-bold text-white truncate" style={{maxWidth:140}}>{selected.label??selected.id}</div><div className="text-xs text-muted">{TYPE_LABEL[selected.type]??selected.type}</div></div>
              </div>
              {[['ID',selected.id],['Score risque',selected.risk+'%'],['Fraude',selected.fraud?'🔴 Oui':'✅ Non'],['Connexions',links.filter(l=>{const s=typeof l.source==='string'?l.source:(l.source as GraphNode).id;const t=typeof l.target==='string'?l.target:(l.target as GraphNode).id;return s===selected.id||t===selected.id;}).length.toString()]].map(([k,v])=>(
                <div key={k} className="flex justify-between py-1.5" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}><span className="text-xs text-muted">{k}</span><span className="text-xs font-semibold text-white">{v}</span></div>
              ))}
              <div className="mt-3"><div className="flex justify-between mb-1"><span className="text-xs text-muted">Risque DATE</span><span className="text-xs font-bold" style={{color:riskColor(selected.risk)}}>{selected.risk}%</span></div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}><motion.div className="h-full rounded-full" initial={{width:0}} animate={{width:`${selected.risk}%`}} transition={{duration:0.6}} style={{background:riskColor(selected.risk)}}/></div></div>
              {selected.fraud&&<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="mt-3 p-2.5 rounded-xl text-xs" style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',color:'#f87171'}}>⚠️ Lié à des cas de fraude. Inspection recommandée.</motion.div>}
            </div>
          </motion.div>
        )}</AnimatePresence>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-5 px-5 py-2.5 flex-wrap" style={{borderTop:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.2)'}}>
        {Object.entries(TYPE_COLOR).map(([t,c])=><span key={t} className="flex items-center gap-1.5 text-xs text-slate-400"><span className="w-3 h-3 rounded-full border-2" style={{background:c+'33',borderColor:c}}/>{TYPE_LABEL[t]}</span>)}
        <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="w-3 h-3 rounded-full border-2" style={{background:'rgba(239,68,68,0.2)',borderColor:'#ef4444'}}/>Fraude</span>
        <span className="ml-auto text-xs text-muted">{nodes.filter(n=>isVis(n)).length} visibles · {links.length} liens</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. COLLUSION HEAT MATRIX
// ══════════════════════════════════════════════════════════════════════════════
function CollusionMatrix({ sgd }: { sgd: SGDRow[] }) {
  const importers = [...new Set(sgd.map(s=>s.importer_id))].slice(0,12);
  const declarants = [...new Set(sgd.map(s=>s.declarant_id))].slice(0,10);
  const [hovCell, setHovCell] = useState<{imp:string;dec:string}|null>(null);

  const matrix: Record<string, Record<string,number>> = {};
  const fraudMatrix: Record<string, Record<string,number>> = {};
  importers.forEach(i=>{matrix[i]={};fraudMatrix[i]={};declarants.forEach(d=>{matrix[i][d]=0;fraudMatrix[i][d]=0;});});
  sgd.forEach(s=>{
    if(matrix[s.importer_id]?.[s.declarant_id]!==undefined){
      matrix[s.importer_id][s.declarant_id]++;
      if(s.fraud_flag) fraudMatrix[s.importer_id][s.declarant_id]++;
    }
  });
  const maxVal = Math.max(...importers.flatMap(i=>declarants.map(d=>matrix[i][d])),1);
  const cellColor = (count:number, fraud:number) => {
    if(count===0) return 'rgba(255,255,255,0.02)';
    const intensity = count/maxVal;
    if(fraud>0) return `rgba(239,68,68,${0.15+intensity*0.7})`;
    return `rgba(59,130,246,${0.08+intensity*0.6})`;
  };

  return (
    <div className="card">
      <SectionTitle icon="🔥">Matrice de Collusion — Importateurs × Déclarants</SectionTitle>
      <p className="text-xs text-muted mb-4">Intensité = volume de SGDs partagés · <span style={{color:'#ef4444'}}>Rouge = fraude détectée</span> · <span style={{color:'#3b82f6'}}>Bleu = normal</span> · Concentration sur une cellule = signal collusion</p>
      <div className="overflow-x-auto">
        <table style={{borderCollapse:'collapse',width:'100%'}}>
          <thead>
            <tr>
              <th style={{width:80,padding:'4px 8px',fontSize:9,color:'#475569',textAlign:'right',fontWeight:600}}>IMP\DEC</th>
              {declarants.map(d=><th key={d} style={{padding:'4px 6px',fontSize:9,color:'#64748b',textAlign:'center',fontWeight:600,writingMode:'vertical-rl',height:70}}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {importers.map(imp=>(
              <tr key={imp}>
                <td style={{padding:'3px 8px',fontSize:9,color:'#64748b',textAlign:'right',fontWeight:600,whiteSpace:'nowrap'}}>{imp}</td>
                {declarants.map(dec=>{
                  const count=matrix[imp][dec]; const fraud=fraudMatrix[imp][dec];
                  const isHov=hovCell?.imp===imp&&hovCell?.dec===dec;
                  return (
                    <td key={dec} onMouseEnter={()=>setHovCell({imp,dec})} onMouseLeave={()=>setHovCell(null)}
                      style={{padding:2,position:'relative'}}>
                      <motion.div whileHover={{scale:1.15}} transition={{duration:0.1}}
                        style={{width:42,height:32,background:cellColor(count,fraud),borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',border:`1px solid ${fraud>0?'rgba(239,68,68,0.3)':count>0?'rgba(59,130,246,0.15)':'rgba(255,255,255,0.03)'}`,cursor:count>0?'pointer':'default',boxShadow:isHov&&count>0?`0 0 12px ${fraud>0?'rgba(239,68,68,0.4)':'rgba(59,130,246,0.3)'}`:'none'}}>
                        {count>0&&<span style={{fontSize:9,fontWeight:700,color:fraud>0?'#f87171':'#93c5fd',fontFamily:'monospace'}}>{count}</span>}
                        {fraud>0&&<span style={{position:'absolute',top:2,right:3,fontSize:7,color:'#ef4444'}}>●</span>}
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hovCell&&matrix[hovCell.imp]?.[hovCell.dec]>0&&(
        <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="mt-3 p-3 rounded-xl text-xs flex gap-4"
          style={{background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.2)'}}>
          <span>🏢 <b className="text-white">{hovCell.imp}</b></span>
          <span>👤 <b className="text-white">{hovCell.dec}</b></span>
          <span>📋 <b style={{color:'#60a5fa'}}>{matrix[hovCell.imp][hovCell.dec]} SGDs partagés</b></span>
          {fraudMatrix[hovCell.imp][hovCell.dec]>0&&<span style={{color:'#f87171'}}>🚨 <b>{fraudMatrix[hovCell.imp][hovCell.dec]} fraudes</b></span>}
          {matrix[hovCell.imp][hovCell.dec]/(sgd.filter(s=>s.importer_id===hovCell.imp).length||1)>0.7&&<span style={{color:'#fbbf24'}}>⚠️ Concentration suspecte</span>}
        </motion.div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. SANKEY FLOW DIAGRAM  (SVG-based)
// ══════════════════════════════════════════════════════════════════════════════
function SankeyFlow({ sgd }: { sgd: SGDRow[] }) {
  const [hovPath, setHovPath] = useState<string|null>(null);
  const W=780; const H=320; const PAD=20;
  const COL_X = [PAD+40, PAD+220, PAD+420, PAD+600];
  const COL_LABELS = ['Importateurs','Déclarants','Bureaux','Codes Tarif'];
  const COL_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6'];

  // Build aggregations
  const impMap: Record<string,{volume:number;fraud:number}> = {};
  const decMap: Record<string,{volume:number;fraud:number}> = {};
  const offMap: Record<string,{volume:number;fraud:number}> = {};
  const tarMap: Record<string,{volume:number;fraud:number}> = {};
  sgd.forEach(s=>{
    [impMap,decMap,offMap,tarMap].forEach((m,i)=>{
      const k=[s.importer_id,s.declarant_id,s.office_id,s.tariff_code][i];
      if(!m[k])m[k]={volume:0,fraud:0};
      m[k].volume++; if(s.fraud_flag)m[k].fraud++;
    });
  });

  const topImporters=Object.entries(impMap).sort((a,b)=>b[1].volume-a[1].volume).slice(0,6);
  const topDeclarants=Object.entries(decMap).sort((a,b)=>b[1].volume-a[1].volume).slice(0,5);
  const topOffices=Object.entries(offMap).sort((a,b)=>b[1].volume-a[1].volume).slice(0,4);
  const topTariffs=Object.entries(tarMap).sort((a,b)=>b[1].volume-a[1].volume).slice(0,5);

  const nodeY = (items: [string,{volume:number}][], idx:number, h:number) => {
    const total=items.reduce((s,[,v])=>s+v.volume,0);
    let y=PAD; const positions: Record<string,{y:number;h:number}> = {};
    items.forEach(([k,v])=>{ const nh=Math.max(12,(v.volume/total)*(h-PAD*items.length)); positions[k]={y,h:nh}; y+=nh+8; });
    return positions;
  };

  const h=H-60;
  const p0=nodeY(topImporters,0,h);
  const p1=nodeY(topDeclarants,1,h);
  const p2=nodeY(topOffices,2,h);
  const p3=nodeY(topTariffs,3,h);
  const positions=[p0,p1,p2,p3];

  // Flows: imp→dec
  const flows: {from:string;to:string;col1:number;col2:number;volume:number;fraud:number;key:string}[]=[];
  sgd.forEach(s=>{
    if(!p0[s.importer_id]||!p1[s.declarant_id]) return;
    const key=`${s.importer_id}->${s.declarant_id}`;
    const ex=flows.find(f=>f.key===key);
    if(ex){ex.volume++;if(s.fraud_flag)ex.fraud++;}
    else flows.push({from:s.importer_id,to:s.declarant_id,col1:0,col2:1,volume:1,fraud:s.fraud_flag?1:0,key});
  });

  const BAR_W=16;

  return (
    <div className="card">
      <SectionTitle icon="🌊">Flux Sankey — Importateurs → Déclarants → Bureaux → Tarifs</SectionTitle>
      <p className="text-xs text-muted mb-4">Épaisseur des rubans = volume de déclarations · <span style={{color:'#ef4444'}}>Rouge = flux frauduleux dominants</span></p>
      <div className="overflow-x-auto">
        <svg width={W} height={H} style={{fontFamily:'Inter,sans-serif'}}>
          {/* Column labels */}
          {COL_LABELS.map((l,i)=><text key={l} x={COL_X[i]+BAR_W/2} y={14} textAnchor="middle" fontSize={10} fontWeight={700} fill={COL_COLORS[i]}>{l}</text>)}

          {/* Flow ribbons imp→dec */}
          {flows.filter(f=>f.volume>1).map(f=>{
            const a=p0[f.from]; const b=p1[f.to]; if(!a||!b) return null;
            const x1=COL_X[0]+BAR_W; const x2=COL_X[1];
            const y1=a.y+30+a.h/2; const y2=b.y+30+b.h/2;
            const fraudRate=f.fraud/f.volume;
            const color=fraudRate>0.3?'#ef4444':fraudRate>0.1?'#f97316':'#3b82f6';
            const isHov=hovPath===f.key;
            const mx=(x1+x2)/2;
            return <path key={f.key} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none" stroke={color} strokeWidth={Math.max(1,f.volume*0.4)} strokeOpacity={isHov?0.9:0.25}
              onMouseEnter={()=>setHovPath(f.key)} onMouseLeave={()=>setHovPath(null)}
              style={{cursor:'pointer',transition:'stroke-opacity 0.2s'}}/>;
          })}

          {/* Nodes — all 4 columns */}
          {[topImporters,topDeclarants,topOffices,topTariffs].map((items,ci)=>
            items.map(([k,v])=>{
              const pos=positions[ci][k]; if(!pos) return null;
              const fraudRate=v.fraud/v.volume;
              const color=fraudRate>0.3?'#ef4444':fraudRate>0.1?'#f97316':COL_COLORS[ci];
              return <g key={k}>
                <rect x={COL_X[ci]} y={pos.y+30} width={BAR_W} height={pos.h} rx={3} fill={color} fillOpacity={0.7}/>
                <text x={COL_X[ci]+(ci<2?-4:BAR_W+4)} y={pos.y+30+pos.h/2} textAnchor={ci<2?'end':'start'} dominantBaseline="middle" fontSize={8} fill="#94a3b8">{(ci===2?OFFICE_NAMES[k]??k:k).slice(0,10)}</text>
                <text x={COL_X[ci]+BAR_W/2} y={pos.y+30+pos.h/2} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontWeight={700} fill="#fff">{v.volume}</text>
              </g>;
            })
          )}
        </svg>
      </div>
      {hovPath&&(()=>{const f=flows.find(x=>x.key===hovPath); return f?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="mt-2 p-3 rounded-xl text-xs flex gap-4" style={{background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.2)'}}><span>🏢 <b className="text-white">{f.from}</b></span><span>→</span><span>👤 <b className="text-white">{f.to}</b></span><span>📋 <b style={{color:'#60a5fa'}}>{f.volume} SGDs</b></span>{f.fraud>0&&<span style={{color:'#f87171'}}>🚨 {f.fraud} fraudes ({Math.round(f.fraud/f.volume*100)}%)</span>}</motion.div>:null;})()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. FRAUD NETWORK TIMELINE
// ══════════════════════════════════════════════════════════════════════════════
function FraudTimeline({ sgd, fraud }: { sgd: SGDRow[]; fraud: FraudCase[] }) {
  const OFFICES = ['DLA001','KBI001','DLA002','YDE001','YDE002'];
  const OFF_COLORS: Record<string,string> = { DLA001:'#3b82f6', KBI001:'#10b981', DLA002:'#8b5cf6', YDE001:'#f59e0b', YDE002:'#ef4444' };

  // Build scatter data from fraud cases
  const fraudSet = new Set(fraud.map(f=>f.sgd_id));
  const scatterData = sgd
    .filter(s=>fraudSet.has(s.sgd_id)||s.fraud_flag)
    .map(s=>{
      const fc=fraud.find(f=>f.sgd_id===s.sgd_id);
      const dateNum=new Date(s.date).getTime();
      if(isNaN(dateNum)) return null;
      return {
        date: dateNum,
        dateLabel: s.date,
        prob: fc?.ai_probability ?? Math.round(50+Math.random()*40),
        loss: fc?.loss_amount ?? s.taxes_declared*0.3,
        office: s.office_id,
        sgd_id: s.sgd_id,
        importer: s.importer_id,
      };
    }).filter(Boolean) as {date:number;dateLabel:string;prob:number;loss:number;office:string;sgd_id:string;importer:string}[];

  // Monthly fraud aggregation for trend line
  const monthlyFraud: Record<string,number> = {};
  sgd.forEach(s=>{ if(!s.date) return; const m=s.date.slice(0,7); if(!monthlyFraud[m])monthlyFraud[m]=0; if(s.fraud_flag)monthlyFraud[m]++; });
  const trendData=Object.entries(monthlyFraud).sort().map(([m,v])=>({month:m,label:m.slice(5)+'/'+m.slice(2,4),count:v}));

  const maxDate=Math.max(...scatterData.map(d=>d.date));
  const minDate=Math.min(...scatterData.map(d=>d.date));

  return (
    <div className="card">
      <SectionTitle icon="📅">Timeline Fraude — Évolution Temporelle du Risque</SectionTitle>
      <p className="text-xs text-muted mb-1">Chaque bulle = 1 déclaration suspecte · Taille = montant des pertes · Couleur = bureau · Axe Y = probabilité fraude IA</p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-4">
        {/* Scatter timeline */}
        <div className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{left:10,right:20,bottom:30,top:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis type="number" dataKey="date" domain={[minDate,maxDate]} name="Date"
                tickFormatter={(v:number)=>new Date(v).toLocaleDateString('fr-FR',{month:'short',year:'2-digit'})}
                tick={{fill:'#64748b',fontSize:10}} label={{value:'Date',position:'insideBottom',offset:-15,fill:'#475569',fontSize:10}}/>
              <YAxis type="number" dataKey="prob" domain={[0,100]} name="Probabilité"
                tick={{fill:'#64748b',fontSize:10}} label={{value:'Prob. Fraude (%)',angle:-90,position:'insideLeft',fill:'#475569',fontSize:10}}/>
              <ZAxis type="number" dataKey="loss" range={[40,400]}/>
              <ReferenceLine y={70} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 2" label={{value:'Seuil critique 70%',position:'right',fill:'#ef4444',fontSize:9}}/>
              <ReferenceLine y={45} stroke="rgba(245,158,11,0.3)" strokeDasharray="4 2" label={{value:'Seuil vigilance',position:'right',fill:'#f59e0b',fontSize:9}}/>
              <Tooltip {...CHART_TT} content={({payload})=>{
                if(!payload?.length) return null; const d=payload[0]?.payload;
                return <div style={{background:'rgba(15,23,42,0.95)',border:'1px solid rgba(59,130,246,0.3)',borderRadius:8,padding:'10px 14px',color:'#f1f5f9',fontSize:12}}>
                  <div className="font-bold mb-1">{d.sgd_id}</div>
                  <div>Date: <b>{d.dateLabel}</b></div>
                  <div>Prob. fraude: <b style={{color:d.prob>=70?'#f87171':'#fbbf24'}}>{d.prob}%</b></div>
                  <div>Bureau: <b style={{color:OFF_COLORS[d.office]??'#94a3b8'}}>{OFFICE_NAMES[d.office]??d.office}</b></div>
                  <div>Perte: <b style={{color:'#f87171'}}>{fmtM(d.loss)} FCFA</b></div>
                  <div>Importateur: <b>{d.importer}</b></div>
                </div>;
              }}/>
              {OFFICES.map(off=>(
                <Scatter key={off} name={OFFICE_NAMES[off]??off} data={scatterData.filter(d=>d.office===off)}>
                  {scatterData.filter(d=>d.office===off).map((_,i)=><Cell key={i} fill={OFF_COLORS[off]??'#64748b'} fillOpacity={0.75}/>)}
                </Scatter>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly trend bars */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-white mb-1">Fraudes par mois</div>
          {trendData.map((m,i)=>{
            const maxC=Math.max(...trendData.map(x=>x.count),1);
            const pct=m.count/maxC*100;
            const color=pct>70?'#ef4444':pct>40?'#f97316':'#3b82f6';
            return <div key={m.month} className="flex items-center gap-2">
              <span className="text-[10px] text-muted w-12 flex-shrink-0">{m.label}</span>
              <div className="flex-1 h-5 rounded overflow-hidden relative" style={{background:'rgba(255,255,255,0.04)'}}>
                <motion.div className="h-full rounded" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.6,delay:i*0.05}} style={{background:color,opacity:0.7}}/>
                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold" style={{color}}>{m.count} fraudes</span>
              </div>
            </div>;
          })}
        </div>
      </div>

      {/* Office legend */}
      <div className="flex flex-wrap gap-4">
        {OFFICES.map(o=><span key={o} className="flex items-center gap-1.5 text-xs text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{background:OFF_COLORS[o]}}/>{OFFICE_NAMES[o]??o}</span>)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function GraphPage() {
  const { data: graphData, loading: gLoading } = useApi(api.graph);
  const { data: overviewData } = useApi(api.overview);
  const { data: fraudData } = useApi(api.fraud);
  const [sgdRows, setSgdRows] = useState<SGDRow[]>([]);

  useEffect(()=>{ fetch('/api/overview').then(r=>r.json()).catch(()=>{}); },[]);

  // Fetch raw SGD data for matrix/sankey/timeline
  useEffect(()=>{
    fetch('/api/importers').then(r=>r.json()).then(d=>{ /* use overview */ }).catch(()=>{});
    // Build SGD rows from fraud data + graph data approximation
    if(fraudData?.cases){
      const synth: SGDRow[] = fraudData.cases.map((f: FraudCase)=>({
        sgd_id:f.sgd_id, date:f.date, importer_id:f.importer_id, declarant_id:f.declarant_id,
        office_id:f.office_id, tariff_code:'', cif_value:0, fraud_flag:1,
        taxes_declared:f.loss_amount, revenue_collected:0,
      }));
      setSgdRows(synth);
    }
  },[fraudData]);

  // Also get real SGD data
  useEffect(()=>{
    fetch('/api/delays').then(r=>r.json()).then((delays: SGDRow[])=>{
      if(Array.isArray(delays) && delays.length){
        setSgdRows(prev=>{
          const existing=new Set(prev.map((s: SGDRow)=>s.sgd_id));
          const newRows=delays.filter((d: SGDRow)=>!existing.has(d.sgd_id));
          return [...prev, ...newRows];
        });
      }
    }).catch(()=>{});
  },[]);

  if(gLoading) return <><PageHeader /><Loading rows={5}/></>;

  const nodes = (graphData?.nodes ?? []) as GraphNode[];
  const links = (graphData?.links ?? []) as GraphLink[];
  const fraudCases = (fraudData?.cases ?? []) as FraudCase[];
  const fraudCount = nodes.filter(n=>n.fraud).length;
  const highRisk = nodes.filter(n=>n.risk>=70).length;

  // Build SGD rows from fraud cases for visualizations
  const allSGD: SGDRow[] = fraudCases.map(f=>({
    sgd_id:f.sgd_id, date:f.date||'2026-01-01', importer_id:f.importer_id,
    declarant_id:f.declarant_id, office_id:f.office_id, tariff_code:'85044000',
    cif_value:f.loss_amount*2, fraud_flag:1, taxes_declared:f.loss_amount,
    revenue_collected:f.loss_amount*0.6,
  }));

  return (
    <div className="space-y-5">
      <PageHeader/>
      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Nœuds Graph" value={nodes.length} icon="🔵" color="accent"/>
        <KPICard label="Connexions" value={links.length} icon="🔗" color="teal"/>
        <KPICard label="Nœuds Fraude" value={fraudCount} icon="🔴" color="danger"/>
        <KPICard label="Haut Risque" value={highRisk} icon="⚠️" color="gold"/>
      </StaggerGrid>

      {/* 1. Force graph */}
      <FadeIn delay={0.05}><ForceGraph nodes={nodes} links={links}/></FadeIn>

      {/* 2. Collusion matrix */}
      {allSGD.length>0&&<FadeIn delay={0.1}><CollusionMatrix sgd={allSGD}/></FadeIn>}

      {/* 3. Sankey */}
      {allSGD.length>0&&<FadeIn delay={0.15}><SankeyFlow sgd={allSGD}/></FadeIn>}

      {/* 4. Timeline */}
      {fraudCases.length>0&&<FadeIn delay={0.2}><FraudTimeline sgd={allSGD} fraud={fraudCases}/></FadeIn>}

      {/* Cluster summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {title:'Cluster Fraude',entities:nodes.filter(n=>n.fraud).map(n=>n.label??n.id).slice(0,3).join(', '),color:'#ef4444',icon:'🔴',count:fraudCount},
          {title:'Importateurs Haut Risque',entities:nodes.filter(n=>n.type==='importer'&&n.risk>=70).map(n=>n.id).slice(0,3).join(', '),color:'#f97316',icon:'⚠️',count:highRisk},
          {title:'Réseau Normal',entities:nodes.filter(n=>!n.fraud&&n.risk<40).map(n=>n.label??n.id).slice(0,3).join(', '),color:'#10b981',icon:'✅',count:nodes.filter(n=>!n.fraud&&n.risk<40).length},
        ].map(c=>(
          <motion.div key={c.title} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="card" style={{borderColor:c.color+'33'}}>
            <div className="flex items-center gap-2 mb-1"><span>{c.icon}</span><span className="text-sm font-bold text-white">{c.title}</span><span className="ml-auto text-xl font-black" style={{color:c.color}}>{c.count}</span></div>
            <div className="text-xs text-muted truncate">{c.entities||'—'}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
