import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { api, fmt } from '../services/api';
import { PageHeader } from '../App';
import { KPICard, SectionTitle, Loading, ErrorBox, FadeIn, StaggerGrid } from '../components/UI';

interface GraphNode {
  id: string; label: string; type: string; risk: number; fraud?: boolean;
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null;
}
interface GraphLink { source: string | GraphNode; target: string | GraphNode; fraud: boolean; }

const TYPE_COLOR: Record<string, string> = {
  importer:  '#3b82f6',
  declarant: '#10b981',
  sgd:       '#8b5cf6',
  office:    '#f59e0b',
};
const TYPE_LABEL: Record<string, string> = {
  importer: 'Importateur', declarant: 'Déclarant', sgd: 'SGD', office: 'Bureau',
};
const TYPE_RADIUS: Record<string, number> = {
  importer: 18, declarant: 14, sgd: 9, office: 20,
};

function riskColor(r: number) {
  return r >= 80 ? '#ef4444' : r >= 60 ? '#f97316' : r >= 40 ? '#eab308' : '#10b981';
}

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data, loading, error } = useApi(api.graph);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'FRAUD' | 'IMPORTERS' | 'DECLARANTS'>('ALL');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef<GraphNode | null>(null);

  // Force simulation
  const runSimulation = useCallback((ns: GraphNode[], ls: GraphLink[]) => {
    const W = 900; const H = 520;
    const nodeMap = new Map(ns.map(n => [n.id, n]));

    // Initialize positions
    ns.forEach((n, i) => {
      if (!n.x) {
        const angle = (i / ns.length) * Math.PI * 2;
        const r = 160 + Math.random() * 80;
        n.x = W / 2 + Math.cos(angle) * r;
        n.y = H / 2 + Math.sin(angle) * r;
        n.vx = 0; n.vy = 0;
      }
    });

    let alpha = 1;
    if (simRef.current) clearInterval(simRef.current);

    simRef.current = setInterval(() => {
      if (alpha < 0.01) { clearInterval(simRef.current!); return; }
      alpha *= 0.97;

      // Repulsion between nodes
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i]; const b = ns[j];
          const dx = (b.x ?? 0) - (a.x ?? 0);
          const dy = (b.y ?? 0) - (a.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const strength = (3000 / (dist * dist)) * alpha;
          const fx = (dx / dist) * strength;
          const fy = (dy / dist) * strength;
          a.vx = (a.vx ?? 0) - fx; a.vy = (a.vy ?? 0) - fy;
          b.vx = (b.vx ?? 0) + fx; b.vy = (b.vy ?? 0) + fy;
        }
      }

      // Link attraction
      ls.forEach(l => {
        const a = nodeMap.get(typeof l.source === 'string' ? l.source : l.source.id);
        const b = nodeMap.get(typeof l.target === 'string' ? l.target : l.target.id);
        if (!a || !b) return;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 80;
        const strength = ((dist - target) / dist) * 0.08 * alpha;
        a.vx = (a.vx ?? 0) + dx * strength; a.vy = (a.vy ?? 0) + dy * strength;
        b.vx = (b.vx ?? 0) - dx * strength; b.vy = (b.vy ?? 0) - dy * strength;
      });

      // Center gravity
      ns.forEach(n => {
        n.vx = (n.vx ?? 0) + (W / 2 - (n.x ?? 0)) * 0.01 * alpha;
        n.vy = (n.vy ?? 0) + (H / 2 - (n.y ?? 0)) * 0.01 * alpha;
      });

      // Apply velocity + damping
      ns.forEach(n => {
        if (n.fx != null) { n.x = n.fx; n.y = n.fy ?? 0; return; }
        n.vx = (n.vx ?? 0) * 0.8;
        n.vy = (n.vy ?? 0) * 0.8;
        n.x = Math.max(30, Math.min(W - 30, (n.x ?? 0) + (n.vx ?? 0)));
        n.y = Math.max(30, Math.min(H - 30, (n.y ?? 0) + (n.vy ?? 0)));
      });

      setNodes([...ns]);
    }, 20);
  }, []);

  useEffect(() => {
    if (!data) return;
    const ns = (data.nodes as GraphNode[]).map(n => ({ ...n, x: undefined, y: undefined, vx: 0, vy: 0, fx: null, fy: null }));
    const ls = data.links as GraphLink[];
    setNodes(ns); setLinks(ls);
    runSimulation(ns, ls);
    return () => { if (simRef.current) clearInterval(simRef.current); };
  }, [data, runSimulation]);

  // Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const newK = Math.max(0.3, Math.min(4, transformRef.current.k * factor));
    transformRef.current = { ...transformRef.current, k: newK };
    setTransform({ ...transformRef.current });
  };

  // Pan
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('.node-group')) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
  };
  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (draggingRef.current) {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.k;
      const y = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.k;
      draggingRef.current.fx = x; draggingRef.current.fy = y;
      draggingRef.current.x = x; draggingRef.current.y = y;
      setNodes(ns => [...ns]);
    } else if (isPanningRef.current) {
      transformRef.current = { ...transformRef.current, x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y };
      setTransform({ ...transformRef.current });
    }
  };
  const handleSvgMouseUp = () => {
    isPanningRef.current = false;
    if (draggingRef.current) { draggingRef.current.fx = null; draggingRef.current.fy = null; draggingRef.current = null; }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    draggingRef.current = node;
  };
  const handleNodeClick = (e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    setSelected(s => s?.id === node.id ? null : node);
  };

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    setTransform({ x: 0, y: 0, k: 1 });
  };

  // Filter visibility
  const isVisible = (node: GraphNode) => {
    if (filterMode === 'ALL') return true;
    if (filterMode === 'FRAUD') return node.fraud || node.risk >= 70;
    if (filterMode === 'IMPORTERS') return node.type === 'importer';
    if (filterMode === 'DECLARANTS') return node.type === 'declarant';
    return true;
  };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const fraudCount = nodes.filter(n => n.fraud).length;
  const highRiskCount = nodes.filter(n => n.risk >= 70).length;
  const linkCount = links.length;

  if (loading) return <><PageHeader /><Loading rows={5} /></>;
  if (error)   return <><PageHeader /><ErrorBox message={error} /></>;

  return (
    <div className="space-y-5">
      <PageHeader />

      <StaggerGrid className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard label="Nœuds Graph" value={nodes.length} icon="🔵" color="accent" />
        <KPICard label="Connexions" value={linkCount} icon="🔗" color="teal" />
        <KPICard label="Nœuds Fraude" value={fraudCount} icon="🔴" color="danger" />
        <KPICard label="Haut Risque" value={highRiskCount} icon="⚠️" color="gold" />
      </StaggerGrid>

      <FadeIn delay={0.1}>
        <div className="card p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b flex-wrap"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
            <span className="text-sm font-bold text-white flex items-center gap-2">🕸️ Graphe DATE — Réseau Entités</span>

            {/* Filter buttons */}
            <div className="flex gap-2 ml-4">
              {([['ALL','Tout afficher','#3b82f6'],['FRAUD','Fraudes','#ef4444'],['IMPORTERS','Importateurs','#3b82f6'],['DECLARANTS','Déclarants','#10b981']] as [string,string,string][]).map(([v,l,c]) => (
                <button key={v} onClick={() => setFilterMode(v as typeof filterMode)}
                  className="text-xs px-3 py-1 rounded-full font-semibold transition-all"
                  style={{ background: filterMode === v ? c + '22' : 'transparent', border: `1px solid ${filterMode === v ? c : 'rgba(255,255,255,0.08)'}`, color: filterMode === v ? c : '#64748b' }}>
                  {l}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={resetView} className="btn btn-ghost text-xs px-3 py-1">⟲ Reset vue</button>
              <span className="text-xs text-muted">Scroll=zoom · Drag=déplacer · Clic=détail</span>
            </div>
          </div>

          <div className="flex">
            {/* SVG graph */}
            <svg ref={svgRef} className="flex-1 cursor-grab active:cursor-grabbing select-none"
              style={{ height: 540, background: 'linear-gradient(135deg,#020817 0%,#0b1221 100%)' }}
              onWheel={handleWheel} onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}>

              {/* Grid pattern */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(59,130,246,0.04)" strokeWidth="1"/>
                </pattern>
                <filter id="glow-blue">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="glow-red">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                {/* Links */}
                {links.map((l, i) => {
                  const a = nodeMap.get(typeof l.source === 'string' ? l.source : (l.source as GraphNode).id);
                  const b = nodeMap.get(typeof l.target === 'string' ? l.target : (l.target as GraphNode).id);
                  if (!a || !b || !a.x || !b.x) return null;
                  const aVis = isVisible(a); const bVis = isVisible(b);
                  const opacity = filterMode !== 'ALL' ? (aVis && bVis ? 0.6 : 0.04) : (l.fraud ? 0.6 : 0.12);
                  return (
                    <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={l.fraud ? '#ef4444' : 'rgba(148,163,184,1)'}
                      strokeWidth={l.fraud ? 1.5 : 0.8}
                      strokeOpacity={opacity}
                      strokeDasharray={l.fraud ? '4 2' : undefined}
                    />
                  );
                })}

                {/* Nodes */}
                {nodes.map(node => {
                  if (!node.x || !node.y) return null;
                  const color = node.fraud ? '#ef4444' : TYPE_COLOR[node.type] ?? '#64748b';
                  const r = TYPE_RADIUS[node.type] ?? 12;
                  const isSelected = selected?.id === node.id;
                  const isHovered = hoveredId === node.id;
                  const visible = isVisible(node);
                  const opacity = filterMode !== 'ALL' && !visible ? 0.08 : 1;

                  return (
                    <g key={node.id} className="node-group" style={{ opacity, cursor: 'pointer' }}
                      onMouseDown={e => handleNodeMouseDown(e, node)}
                      onClick={e => handleNodeClick(e, node)}
                      onMouseEnter={() => setHoveredId(node.id)}
                      onMouseLeave={() => setHoveredId(null)}>

                      {/* Pulse ring for fraud/high risk */}
                      {(node.fraud || node.risk >= 70) && (
                        <circle cx={node.x} cy={node.y} r={r + 8} fill="none"
                          stroke={color} strokeWidth={1} strokeOpacity={0.2 + Math.sin(Date.now() / 800) * 0.1} />
                      )}

                      {/* Selection ring */}
                      {isSelected && (
                        <circle cx={node.x} cy={node.y} r={r + 6} fill="none"
                          stroke="#ffffff" strokeWidth={2} strokeOpacity={0.6} strokeDasharray="4 2" />
                      )}

                      {/* Main circle */}
                      <circle cx={node.x} cy={node.y} r={isHovered ? r + 3 : r}
                        fill={color + (isHovered ? 'cc' : '33')}
                        stroke={color} strokeWidth={isSelected ? 2.5 : 1.5}
                        filter={node.fraud ? 'url(#glow-red)' : isHovered ? 'url(#glow-blue)' : undefined}
                        style={{ transition: 'r 0.15s ease' }}
                      />

                      {/* Type initial */}
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle"
                        fontSize={node.type === 'sgd' ? 7 : 9} fontWeight="bold" fill={color} style={{ pointerEvents: 'none' }}>
                        {node.type === 'sgd' ? node.label.replace('SGD','') : node.type[0].toUpperCase()}
                      </text>

                      {/* Label below (non-SGD only) */}
                      {node.type !== 'sgd' && (isHovered || isSelected) && (
                        <text x={node.x} y={node.y + r + 12} textAnchor="middle"
                          fontSize={9} fill="#94a3b8" style={{ pointerEvents: 'none' }}>
                          {String(node.label ?? node.id).slice(0, 14)}
                        </text>
                      )}

                      {/* Risk score badge for importers */}
                      {node.type === 'importer' && node.risk > 0 && (
                        <text x={node.x + r - 2} y={node.y - r + 4} textAnchor="middle"
                          fontSize={7} fontWeight="bold" fill={riskColor(node.risk)} style={{ pointerEvents: 'none' }}>
                          {node.risk}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Detail panel */}
            <AnimatePresence>
              {selected && (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 240, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                  className="overflow-hidden flex-shrink-0 border-l"
                  style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(9,14,28,0.95)' }}>
                  <div className="p-4" style={{ width: 240 }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted">Détail nœud</span>
                      <button onClick={() => setSelected(null)} className="text-muted hover:text-white text-sm">✕</button>
                    </div>

                    {/* Node icon */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black"
                        style={{ background: (selected.fraud ? '#ef4444' : TYPE_COLOR[selected.type] ?? '#64748b') + '22', border: `2px solid ${selected.fraud ? '#ef4444' : TYPE_COLOR[selected.type] ?? '#64748b'}`, color: selected.fraud ? '#ef4444' : TYPE_COLOR[selected.type] }}>
                        {selected.type[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white truncate" style={{ maxWidth: 150 }}>{selected.label ?? selected.id}</div>
                        <div className="text-xs text-muted">{TYPE_LABEL[selected.type] ?? selected.type}</div>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {[
                        ['ID', selected.id],
                        ['Type', TYPE_LABEL[selected.type] ?? selected.type],
                        ['Score risque', selected.risk + '%'],
                        ['Statut fraude', selected.fraud ? '🔴 Suspect' : '✅ Normal'],
                        ['Connexions', links.filter(l => {
                          const sid = typeof l.source === 'string' ? l.source : l.source.id;
                          const tid = typeof l.target === 'string' ? l.target : l.target.id;
                          return sid === selected.id || tid === selected.id;
                        }).length.toString()],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center py-1.5"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className="text-xs text-muted">{k}</span>
                          <span className="text-xs font-semibold text-white">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Risk gauge */}
                    <div className="mt-4">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-muted">Risque DATE</span>
                        <span className="text-xs font-bold" style={{ color: riskColor(selected.risk) }}>{selected.risk}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                          animate={{ width: `${selected.risk}%` }} transition={{ duration: 0.6 }}
                          style={{ background: riskColor(selected.risk) }} />
                      </div>
                    </div>

                    {selected.fraud && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3 rounded-xl text-xs"
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                        ⚠️ Ce nœud est lié à des cas de fraude confirmés ou suspects. Inspection recommandée.
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 px-5 py-3 border-t flex-wrap"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
            {Object.entries(TYPE_COLOR).map(([t, c]) => (
              <span key={t} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-3 h-3 rounded-full border-2" style={{ background: c + '33', borderColor: c }} />
                {TYPE_LABEL[t]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-3 h-3 rounded-full border-2" style={{ background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444' }} />
              Fraude
            </span>
            <span className="ml-auto text-xs text-muted">
              {nodes.filter(n => isVisible(n)).length} nœuds visibles · {links.length} connexions
            </span>
          </div>
        </div>
      </FadeIn>

      {/* Cluster summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Cluster Fraude Principal', entities: nodes.filter(n => n.fraud).map(n => n.label ?? n.id).slice(0,3).join(', '), color: '#ef4444', icon: '🔴', count: nodes.filter(n => n.fraud).length },
          { title: 'Importateurs Haut Risque', entities: nodes.filter(n => n.type === 'importer' && n.risk >= 70).map(n => n.id).slice(0,3).join(', '), color: '#f97316', icon: '⚠️', count: nodes.filter(n => n.type === 'importer' && n.risk >= 70).length },
          { title: 'Réseau Normal', entities: nodes.filter(n => !n.fraud && n.risk < 40).map(n => n.label ?? n.id).slice(0,3).join(', '), color: '#10b981', icon: '✅', count: nodes.filter(n => !n.fraud && n.risk < 40).length },
        ].map(c => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="card" style={{ borderColor: c.color + '33' }}>
            <div className="flex items-center gap-2 mb-2">
              <span>{c.icon}</span>
              <span className="text-sm font-bold text-white">{c.title}</span>
              <span className="ml-auto text-lg font-black" style={{ color: c.color }}>{c.count}</span>
            </div>
            <div className="text-xs text-muted truncate">{c.entities || '—'}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
