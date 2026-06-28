import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import { LiveDataProvider, useLiveData } from './context/LiveData';

import Dashboard from './pages/Dashboard';
import Importers from './pages/Importers';
import Fraud from './pages/Fraud';
import Delays from './pages/Delays';
import Offices from './pages/Offices';
import AIPage from './pages/AIPage';
import GraphPage from './pages/GraphPage';

const NAV = [
  { path: '/',          icon: '📊', label: 'Tableau de bord',    group: 'PRINCIPAL' },
  { path: '/importers', icon: '🏢', label: 'Importateurs',       group: 'ANALYSE' },
  { path: '/fraud',     icon: '🚨', label: 'Détection Fraude',   group: 'ANALYSE' },
  { path: '/delays',    icon: '⏱️',  label: 'Délais Suspects',   group: 'ANALYSE' },
  { path: '/offices',   icon: '🏛️',  label: 'Bureaux Douaniers', group: 'PERFORMANCE' },
  { path: '/ai',        icon: '🤖', label: 'IA Recommandations', group: 'INTELLIGENCE' },
  { path: '/graph',     icon: '🕸️',  label: 'Graphe DATE',       group: 'INTELLIGENCE' },
];
const GROUPS = [...new Set(NAV.map(n => n.group))];

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/':          { title: 'Tableau de bord exécutif', sub: 'Direction Générale des Douanes — Vue 360°' },
  '/importers': { title: 'Intelligence Importateurs', sub: 'Algorithme DATE · Scoring risque · Profilage comportemental' },
  '/fraud':     { title: 'Centre de Détection Fraude', sub: 'Isolation Forest · XGBoost · DATE Algorithm' },
  '/delays':    { title: 'Délais Suspects', sub: 'Détection patterns · Dédouanement anormal · Risques collusion' },
  '/offices':   { title: 'Performance Bureaux', sub: 'Classement efficacité · Recettes · KPIs opérationnels' },
  '/ai':        { title: 'Recommandations IA', sub: 'Assistant CUSTOMS360 · Analyse contextuelle · Claude AI' },
  '/graph':     { title: 'Graphe DATE — Réseau Entités', sub: 'Visualisation relations · Détection collusion' },
};

function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { sgdCount, fraudCount, demoMode } = useLiveData();

  return (
    <aside className="w-[220px] bg-surface border-r border-border flex flex-col flex-shrink-0 z-10">
      <div className="px-4 py-5 border-b border-border">
        <div className="text-xl font-black tracking-widest">
          <span className="text-accent">CUSTOMS</span>
          <span className="text-gold">360</span>
        </div>
        <div className="text-[10px] text-muted tracking-[2px] uppercase mt-1">Douanes Camerounaises</div>
      </div>
      <nav className="flex-1 overflow-auto py-2">
        {GROUPS.map(g => (
          <div key={g}>
            <div className="px-3 pt-4 pb-1 text-[10px] text-muted font-semibold tracking-[1.5px] uppercase">{g}</div>
            {NAV.filter(n => n.group === g).map(n => (
              <button
                key={n.path}
                className={`nav-item mx-1.5 ${pathname === n.path ? 'active' : ''}`}
                onClick={() => navigate(n.path)}
              >
                <span className="text-base">{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-border text-[11px] text-muted space-y-1.5">
        <div className="flex items-center gap-1.5"><span className="dot-live" />Google Sheets · Live</div>
        {demoMode && (
          <div className="text-[10px] text-gold font-semibold tracking-wide">⚡ MODE DÉMO ACTIF</div>
        )}
        <div className="text-[10px]">{sgdCount} SGDs · {fraudCount} fraudes</div>
        <div className="text-[10px]">v2.0 — Architecture NEXUS360</div>
      </div>
    </aside>
  );
}

function Header() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? PAGE_META['/'];
  const { lastFetched, ageSeconds, refreshing, newDataFlash, manualRefresh, pollInterval } = useLiveData();

  const ageLabel = ageSeconds !== null
    ? ageSeconds < 60 ? `il y a ${ageSeconds}s` : `il y a ${Math.round(ageSeconds / 60)}min`
    : '…';

  return (
    <header className="h-[60px] bg-surface border-b border-border flex items-center px-6 gap-4 flex-shrink-0">
      <div>
        <div className="text-sm font-bold text-white">{meta.title}</div>
        <div className="text-xs text-muted mt-0.5">{meta.sub}</div>
      </div>
      <div className="ml-auto flex items-center gap-3">

        {/* Live data badge — flashes green when new rows detected */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-500 ${
          newDataFlash
            ? 'bg-emerald-400 text-emerald-950 border-emerald-300 scale-105'
            : 'bg-emerald-950 text-emerald-400 border-emerald-900'
        }`}>
          <span className="dot-live" />
          {newDataFlash ? '✨ NOUVELLES DONNÉES !' : 'EN DIRECT'}
        </div>

        {/* Last sync time */}
        {lastFetched && (
          <span className="text-[11px] text-muted hidden xl:block">
            Sync {ageLabel} · auto /{pollInterval}s
          </span>
        )}

        {/* Manual refresh button */}
        <button
          onClick={manualRefresh}
          disabled={refreshing}
          title="Forcer la synchronisation avec Google Sheets"
          className={`btn btn-ghost text-xs flex items-center gap-1.5 ${refreshing ? 'opacity-60' : ''}`}
        >
          <span className={refreshing ? 'animate-spin inline-block' : ''}>🔄</span>
          {refreshing ? 'Sync…' : 'Actualiser'}
        </button>

        <button className="btn btn-ghost text-xs">📥 Exporter</button>
        <div className="w-8 h-8 rounded-full bg-accent2 flex items-center justify-center text-xs font-bold text-white">DG</div>
      </div>
    </header>
  );
}

// Pages auto-reload when sgdCount changes (new Sheet row detected)
function PageContainer() {
  const { sgdCount } = useLiveData();
  return (
    <Routes>
      <Route path="/"          element={<Dashboard   key={sgdCount} />} />
      <Route path="/importers" element={<Importers   key={sgdCount} />} />
      <Route path="/fraud"     element={<Fraud       key={sgdCount} />} />
      <Route path="/delays"    element={<Delays      key={sgdCount} />} />
      <Route path="/offices"   element={<Offices     key={sgdCount} />} />
      <Route path="/ai"        element={<AIPage />} />
      <Route path="/graph"     element={<GraphPage   key={sgdCount} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LiveDataProvider>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              <PageContainer />
            </main>
          </div>
        </div>
      </BrowserRouter>
    </LiveDataProvider>
  );
}
