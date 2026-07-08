import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Knowledge base built from actual demo data ────────────────────────────────
const KB = {
  overview: {
    total_sgd: 2700,
    total_revenue: '3.18B FCFA',
    fraud_count: 324,
    fraud_rate: '12.0%',
    tax_gap: '130M FCFA',
    date_range: 'Jan 2023 – Déc 2024',
  },
  bureaux: [
    { id:'DLA001', name:'Douala Port Principal',  sgds:930, fraud:113, fraud_rate:'12.2%', rev:'1.08B FCFA', efficiency:'73%', baseline:'36h' },
    { id:'KBI001', name:'Kribi Port Autonome',    sgds:439, fraud:52,  fraud_rate:'11.8%', rev:'0.51B FCFA', efficiency:'73%', baseline:'28h' },
    { id:'DLA002', name:'Douala Aéroport',        sgds:318, fraud:36,  fraud_rate:'11.3%', rev:'0.37B FCFA', efficiency:'40%', baseline:'18h' },
    { id:'YDE001', name:'Yaoundé Nsimalen',       sgds:270, fraud:31,  fraud_rate:'11.5%', rev:'0.31B FCFA', efficiency:'66%', baseline:'22h' },
    { id:'YDE002', name:'Yaoundé Centre',         sgds:270, fraud:39,  fraud_rate:'14.4%', rev:'0.31B FCFA', efficiency:'88%', baseline:'48h' },
    { id:'NGD001', name:'Ngaoundéré Rail',        sgds:216, fraud:26,  fraud_rate:'12.0%', rev:'0.25B FCFA', efficiency:'98%', baseline:'72h' },
    { id:'BFR001', name:'Bafoussam Frontière',    sgds:162, fraud:19,  fraud_rate:'11.7%', rev:'0.19B FCFA', efficiency:'84%', baseline:'60h' },
    { id:'GRA001', name:'Garoua Aéroport',        sgds:95,  fraud:8,   fraud_rate:'8.4%',  rev:'0.11B FCFA', efficiency:'55%', baseline:'24h' },
  ],
  fraud_types: [
    { type:'SOUS_EVALUATION',           label:'Sous-évaluation',          count:123, pct:'38%' },
    { type:'FAUSSE_DECLARATION_ORIGINE', label:'Fausse déclaration origine', count:80,  pct:'25%' },
    { type:'CONTREBANDE_PARTIELLE',     label:'Contrebande partielle',    count:76,  pct:'23%' },
    { type:'FAUX_DOCUMENTS',            label:'Faux documents',           count:45,  pct:'14%' },
  ],
  fraud_financial: {
    total_evasion: '130M FCFA',
    total_penalties: '310M FCFA',
    total_recovered: '220M FCFA',
    net_loss: '220M FCFA',
    recovery_rate: '50%',
  },
  fraud_status: {
    EN_COURS: 73, CLOTURE_AMIABLE: 99, CLOTURE_CONTENTIEUX: 86,
    TRANSMIS_JUSTICE: 42, ABANDONNE: 24,
  },
  top_risky_importers: [
    { name:'ORANGE CAMEROUN S.A.', id:'IMP010', fraud:18, total:94, rate:'19%', risk:'HIGH' },
    { name:'PROMODIS SARL',        id:'IMP013', fraud:15, total:88, rate:'17%', risk:'HIGH' },
    { name:'SOCAVER S.A.',         id:'IMP008', fraud:15, total:97, rate:'15%', risk:'HIGH' },
    { name:'AFRICA COMMERCE GROUP',id:'IMP016', fraud:14, total:81, rate:'17%', risk:'HIGH' },
    { name:'CAMEROUN TRADING SERVICES',id:'IMP015',fraud:13,total:78,rate:'17%',risk:'HIGH'},
  ],
  top_inspectors: [
    { name:'MBARGA Jean-Paul',  bureau:'DLA001', fraud:29, total:207, rate:'14.0%' },
    { name:'ATANGA Sylvie',     bureau:'YDE002', fraud:21, total:132, rate:'15.9%' },
    { name:'MOHAMADOU Alim',    bureau:'DLA002', fraud:21, total:160, rate:'13.1%' },
    { name:'NKENGUE Marie',     bureau:'DLA001', fraud:23, total:187, rate:'12.3%' },
    { name:'ESSOMBA Pierre',    bureau:'DLA001', fraud:22, total:185, rate:'11.9%' },
  ],
  worst_delays: [
    { importer:'GOLDEN TRADING SARL',       bureau:'Ngaoundéré Rail', overshoot:'+102h', cause:'Retard intentionnel suspect' },
    { importer:'CAMEROON GLOBAL IMPORTS',   bureau:'Ngaoundéré Rail', overshoot:'+102h', cause:'Congestion inspection' },
    { importer:'AFRICA COMMERCE GROUP',     bureau:'Ngaoundéré Rail', overshoot:'+100h', cause:'Retard intentionnel suspect' },
    { importer:'CAM IMPORT INDUSTRIES',     bureau:'Yaoundé Centre',  overshoot:'+86h',  cause:'Problème documentaire' },
    { importer:'SAHARA TRADING COMPANY',    bureau:'Kribi Port',      overshoot:'+84h',  cause:'Retard intentionnel suspect' },
  ],
  risky_tariffs: [
    { code:'64029900', desc:'Chaussures',            fraud:23, rate:'20%' },
    { code:'62046200', desc:'Vêtements femme coton', fraud:22, rate:'18%' },
    { code:'30042000', desc:'Médicaments antibiotiques',fraud:22,rate:'17%' },
    { code:'85044000', desc:'Transformateurs électriques',fraud:21,rate:'19%' },
    { code:'48010000', desc:'Papier journal',         fraud:19, rate:'18%' },
  ],
  collusion: { suspected_cases: 168, note: '168 dossiers impliquent un couple inspecteur-déclarant actif dans 3+ fraudes' },
  velocity: { index: 71, status: 'IMPROVING', acceleration: '-20% vs mois précédent', current_rate: '3.8%' },
};

// ── Response engine ───────────────────────────────────────────────────────────
type Message = { id: number; role: 'user' | 'bot'; text: string; time: string };

function buildResponse(q: string): string {
  const ql = q.toLowerCase();
  const fmt = (n: number) => n.toLocaleString('fr-FR');

  // KPI overview
  if (/\b(kpi|résumé|bilan|aperçu|overview|total|global|ensemble)\b/.test(ql)) {
    return `📊 **Bilan global CUSTOMS360** (Jan 2023 – Déc 2024)\n\n• **${fmt(KB.overview.total_sgd)} déclarations** traitées\n• **${KB.overview.total_revenue}** de recettes collectées\n• **${KB.overview.fraud_count} cas de fraude** détectés (taux: ${KB.overview.fraud_rate})\n• **${KB.overview.tax_gap}** d'écart fiscal récupéré\n• Périmètre: 8 bureaux douaniers, 30 importateurs, 20 inspecteurs`;
  }

  // Fraud general
  if (/\b(fraude|fraud|cas|dossier)\b/.test(ql) && !/tarif|type|bureau|import|inspect/.test(ql)) {
    const fb = KB.fraud_financial;
    const fs = KB.fraud_status;
    return `🚨 **Situation fraude**\n\n• **${KB.overview.fraud_count} cas** confirmés (${KB.overview.fraud_rate} des déclarations)\n• Évasion fiscale totale: **${fb.total_evasion}**\n• Pénalités levées: **${fb.total_penalties}**\n• Montant récupéré: **${fb.total_recovered}** (taux: ${fb.recovery_rate})\n• Perte nette: **${fb.net_loss}**\n\n**Statuts dossiers:**\n• Clôturés amiable: ${fs.CLOTURE_AMIABLE} | Contentieux: ${fs.CLOTURE_CONTENTIEUX}\n• En cours: ${fs.EN_COURS} | Transmis justice: ${fs.TRANSMIS_JUSTICE} | Abandonnés: ${fs.ABANDONNE}`;
  }

  // Fraud types
  if (/\b(type|catégorie|nature|genre)\b/.test(ql) || /sous.?évaluation|faux doc|contrebande|origine/.test(ql)) {
    const rows = KB.fraud_types.map(t => `• **${t.label}**: ${t.count} cas (${t.pct})`).join('\n');
    return `🔍 **Types de fraude détectés**\n\n${rows}\n\n💡 La sous-évaluation CIF est le mécanisme le plus fréquent — les importateurs déclarent une valeur inférieure au marché pour réduire les taxes.`;
  }

  // Bureaux
  if (/\b(bureau|douane|port|aéroport|office|kribi|douala|yaoundé|ngaoundéré|bafoussam|garoua)\b/.test(ql)) {
    const specific = KB.bureaux.find(b =>
      ql.includes(b.id.toLowerCase()) ||
      ql.includes(b.name.toLowerCase().split(' ')[0].toLowerCase())
    );
    if (specific) {
      return `🏛️ **${specific.name}** (${specific.id})\n\n• Déclarations traitées: **${fmt(specific.sgds)}**\n• Cas de fraude: **${specific.fraud}** (${specific.fraud_rate})\n• Recettes collectées: **${specific.rev}**\n• Score d'efficience: **${specific.efficiency}**\n• Délai standard: ${specific.baseline}\n\n${specific.fraud_rate > '12%' ? '⚠️ Taux de fraude supérieur à la moyenne nationale (12%).' : '✅ Taux de fraude dans la norme.'}`;
    }
    const top3 = KB.bureaux.slice(0,3).map(b => `• **${b.name}**: ${b.sgds} SGDs, ${b.fraud} fraudes (${b.fraud_rate}), efficience ${b.efficiency}`).join('\n');
    return `🏛️ **Performance des 8 bureaux douaniers**\n\n**Top 3 par volume:**\n${top3}\n\n• Bureau le plus efficace: **Ngaoundéré Rail** (98% — 72% plus rapide que le standard)\n• Bureau le plus sollicité: **Douala Port Principal** (${KB.bureaux[0].sgds} SGDs)\n• Bureau le plus sécurisé: **Garoua Aéroport** (taux fraude ${KB.bureaux[7].fraud_rate})`;
  }

  // Importers
  if (/\b(importat|importeur|société|entreprise|opérateur|client)\b/.test(ql)) {
    const specific = KB.top_risky_importers.find(i =>
      ql.includes(i.name.toLowerCase().split(' ')[0].toLowerCase()) ||
      ql.includes(i.id.toLowerCase())
    );
    if (specific) {
      return `👤 **${specific.name}** (${specific.id})\n\n• Profil de risque: **${specific.risk}** 🔴\n• Déclarations: ${fmt(specific.total)}\n• Fraudes détectées: **${specific.fraud}** (taux: ${specific.rate})\n\n⚠️ Cet importateur figure parmi les profils les plus à risque. Recommandation: inspection physique systématique sur toutes nouvelles déclarations.`;
    }
    const rows = KB.top_risky_importers.slice(0,3).map((i,idx) =>
      `${idx+1}. **${i.name}** — ${i.fraud} fraudes/${i.total} décl. (${i.rate})`
    ).join('\n');
    return `👤 **Importateurs à haut risque (Top 5)**\n\n${rows}\n\n💡 Ces importateurs cumulent un historique de fraudes confirmées. Le score DATE (Déclarations Anormales Tracées et Évaluées) reflète leur niveau de risque global.`;
  }

  // Delays
  if (/\b(délai|retard|lent|clearance|dédouanement|heure)\b/.test(ql)) {
    const rows = KB.worst_delays.map((d,i) =>
      `${i+1}. **${d.importer}** @ ${d.bureau}: ${d.overshoot} — ${d.cause}`
    ).join('\n');
    return `⏱️ **Délais suspects les plus critiques**\n\n${rows}\n\n💡 Ngaoundéré Rail concentre les pires retards car le bureau a le délai standard le plus élevé (72h). Les retards intentionnels suspects dépassent souvent 2× le délai standard.`;
  }

  // Inspectors / agents
  if (/\b(agent|inspecteur|douanier|officer|performance|pi|index)\b/.test(ql)) {
    const rows = KB.top_inspectors.map((ins,i) =>
      `${i+1}. **${ins.name}** (${ins.bureau}): ${ins.fraud} fraudes/${ins.total} décl. — taux ${ins.rate}`
    ).join('\n');
    return `👮 **Top 5 Inspecteurs — Détection de fraude**\n\n${rows}\n\n💡 MBARGA Jean-Paul est l'inspecteur le plus productif avec 29 fraudes détectées. ATANGA Sylvie affiche le meilleur **taux de détection** (15.9%), ce qui signifie une vigilance supérieure par rapport au volume traité.`;
  }

  // Tariffs
  if (/\b(tarif|hs|code|marchandise|produit|article)\b/.test(ql)) {
    const rows = KB.risky_tariffs.map((t,i) =>
      `${i+1}. **${t.code}** — ${t.desc}: ${t.fraud} cas (${t.rate})`
    ).join('\n');
    return `📦 **Codes tarifaires les plus à risque**\n\n${rows}\n\n💡 Les chaussures (64029900) et vêtements (62046200) sont particulièrement touchés par la fausse déclaration d'origine — souvent déclarés comme provenant d'Europe alors qu'ils arrivent de Chine.`;
  }

  // Collusion
  if (/\b(collusion|complicité|corrup|intégrité|suspect)\b/.test(ql)) {
    return `🔗 **Analyse de collusion inspecteur-déclarant**\n\n• **${KB.collusion.suspected_cases} dossiers suspects** impliquent un même couple inspecteur–déclarant dans 3 fraudes ou plus\n• Cela représente **${Math.round(KB.collusion.suspected_cases/KB.overview.fraud_count*100)}%** des cas de fraude\n\n⚠️ ${KB.collusion.note}\n\n💡 Recommandation: rotation systématique des affectations inspecteur-déclarant et audit des couples à plus de 3 dossiers communs.`;
  }

  // Velocity / predictions
  if (/\b(velocit|vélocit|tendance|trend|prédict|prévision|hausse|baisse|accélér)\b/.test(ql)) {
    const v = KB.velocity;
    return `⚡ **Indice de Vélocité Fraude**\n\n• Indice actuel: **${v.index}/100** — Statut: **${v.status}** ✅\n• Accélération: **${v.acceleration}**\n• Taux fraude courant: **${v.current_rate}**\n\n💡 Un indice < 100 indique que la fraude diminue par rapport à la moyenne de référence. La tendance est favorable mais la vigilance reste nécessaire car le taux absolu (3.8%) reste significatif.`;
  }

  // Revenue
  if (/\b(recette|revenu|collecte|fiscal|taxe|fcfa)\b/.test(ql)) {
    return `💰 **Recettes douanières**\n\n• Recettes collectées (2 ans): **${KB.overview.total_revenue}**\n• Taxes évaluées vs déclarées: **+${KB.overview.tax_gap}** d'écart récupéré\n• Pénalités levées sur fraudes: **${KB.fraud_financial.total_penalties}**\n• Recettes nettes perdues (fraude): **${KB.fraud_financial.net_loss}**\n\n💡 Le bureau Douala Port Principal génère ~34% des recettes totales. Renforcer les contrôles sur les déclarations CIF à ce bureau aurait le plus fort impact fiscal.`;
  }

  // Recommendations
  if (/\b(recommand|conseil|action|mesure|priorité|faire|améliorer)\b/.test(ql)) {
    return `🎯 **Recommandations prioritaires CUSTOMS360**\n\n1. 🔴 **Inspection systématique** — Appliquer la vérification physique pour ORANGE CAMEROUN S.A. et PROMODIS SARL (taux fraude >15%)\n2. 🟠 **Renfort Ngaoundéré Rail** — 3 des 5 pires retards suspects sont à NGD001, risque de collusion documentaire\n3. 🟡 **Rotation inspecteurs** — ${KB.collusion.suspected_cases} couples inspecteur-déclarant suspects à auditer\n4. 🔵 **Cibler codes 64029900 et 62046200** — Chaussures et vêtements: 45 fraudes combinées, probable fausse origine\n5. ✅ **Capitaliser sur Yaoundé Centre** — Taux détection 14.4%, efficience 88%: modèle à reproduire`;
  }

  // Help / capabilities
  if (/\b(aide|help|quoi|que sais|peux|capacit|fonc|commande)\b/.test(ql)) {
    return `🤖 **Je peux répondre à ces questions:**\n\n📊 KPIs globaux — *"Donne-moi le bilan général"*\n🚨 Fraudes — *"Combien de cas de fraude ?"*\n🏛️ Bureaux — *"Performance de Douala Port ?"*\n👤 Importateurs — *"Quels sont les importateurs à risque ?"*\n👮 Agents — *"Meilleurs inspecteurs ?"*\n⏱️ Délais — *"Quels sont les pires retards ?"*\n📦 Tarifs — *"Codes tarifaires à risque ?"*\n💰 Recettes — *"Bilan fiscal ?"*\n🔗 Collusion — *"Y a-t-il des cas de collusion ?"*\n⚡ Prédictions — *"Tendance de la fraude ?"*\n🎯 Recommandations — *"Que recommandez-vous ?"*`;
  }

  // Fallback
  const suggestions = ['fraude', 'bureaux', 'importateurs', 'délais', 'inspecteurs', 'recettes'];
  const rand = suggestions[Math.floor(Math.random() * suggestions.length)];
  return `Je n'ai pas trouvé de réponse précise pour cette question. Essayez par exemple:\n\n• *"Quels sont les cas de fraude ?"*\n• *"Performance du bureau Douala ?"*\n• *"Importateurs à risque élevé ?"*\n\nOu tapez **aide** pour voir toutes mes capacités.`;
}

// ── Quick suggestion chips ────────────────────────────────────────────────────
const QUICK = [
  { label: '📊 Bilan global',         q: 'Donne-moi le bilan global KPI' },
  { label: '🚨 Fraudes',              q: 'Combien de cas de fraude ?' },
  { label: '👤 Importateurs risque',  q: 'Importateurs à haut risque' },
  { label: '🏛️ Bureaux',             q: 'Performance des bureaux douaniers' },
  { label: '👮 Meilleurs agents',     q: 'Meilleurs inspecteurs en détection' },
  { label: '⏱️ Pires délais',         q: 'Quels sont les pires retards suspects ?' },
  { label: '🎯 Recommandations',      q: 'Que recommandez-vous en priorité ?' },
];

// ── Markdown-lite renderer ────────────────────────────────────────────────────
function renderMd(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={i} style={{ display: 'block', marginBottom: line === '' ? 6 : 2 }}>
        {parts.map((p, j) =>
          j % 2 === 1
            ? <strong key={j} style={{ color: '#f1f5f9' }}>{p}</strong>
            : <span key={j}>{p}</span>
        )}
      </span>
    );
  });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIChat() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [typing, setTyping]   = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    id: 0, role: 'bot', time: new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
    text: '👋 Bonjour ! Je suis votre assistant douanier IA.\n\nJe connais toutes les données CUSTOMS360 : fraudes, bureaux, importateurs, délais, inspecteurs et prédictions.\n\nQue souhaitez-vous analyser ?',
  }]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const send = useCallback((text: string) => {
    if (!text.trim()) return;
    const now = new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const userMsg: Message = { id: Date.now(), role:'user', text: text.trim(), time: now };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setTyping(true);
    // Variable delay for realism
    const delay = 600 + Math.random() * 600;
    setTimeout(() => {
      setTyping(false);
      const reply = buildResponse(text.toLowerCase());
      setMessages(m => [...m, {
        id: Date.now()+1, role:'bot', text: reply,
        time: new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
      }]);
    }, delay);
  }, []);

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); send(input); };

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
          boxShadow: '0 0 0 0 rgba(139,92,246,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}
        animate={!open ? {
          boxShadow: [
            '0 0 0 0px rgba(139,92,246,0.7)',
            '0 0 0 10px rgba(139,92,246,0.0)',
          ]
        } : {}}
        transition={!open ? { repeat: Infinity, duration: 1.8, ease:'easeOut' } : {}}
        aria-label="Assistant IA"
      >
        {open ? '✕' : '🤖'}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'fixed', bottom: 96, right: 28, zIndex: 9998,
              width: 380, maxHeight: '72vh',
              display: 'flex', flexDirection: 'column',
              background: 'rgba(10,17,34,0.97)',
              border: '1px solid rgba(139,92,246,0.35)',
              borderRadius: 18,
              boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.12)',
              backdropFilter: 'blur(20px)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid rgba(139,92,246,0.2)',
              background: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(139,92,246,0.15))',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 22 }}>🤖</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>Assistant Douanier IA</div>
                <div style={{ fontSize: 11, color: '#10b981', display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', display:'inline-block' }} />
                  Données CUSTOMS360 en direct
                </div>
              </div>
              <button
                onClick={() => { setMessages([messages[0]]); }}
                style={{ marginLeft:'auto', fontSize:11, color:'#64748b', background:'none', border:'none', cursor:'pointer' }}
              >Effacer</button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '14px 14px 8px',
              display: 'flex', flexDirection: 'column', gap: 10,
              scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.2) transparent',
            }}>
              {messages.map(m => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}
                >
                  <div style={{
                    maxWidth: '86%',
                    background: m.role==='user'
                      ? 'linear-gradient(135deg,#3b82f6,#6366f1)'
                      : 'rgba(255,255,255,0.05)',
                    border: m.role==='bot' ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    borderRadius: m.role==='user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    padding: '10px 13px',
                    fontSize: 12.5, lineHeight: 1.6,
                    color: m.role==='user' ? '#fff' : '#cbd5e1',
                  }}>
                    {m.role === 'bot' ? renderMd(m.text) : m.text}
                    <div style={{ fontSize:10, color: m.role==='user' ? 'rgba(255,255,255,0.55)' : '#475569', marginTop:4 }}>
                      {m.time}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {typing && (
                <motion.div initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }}
                  style={{ display:'flex', justifyContent:'flex-start' }}>
                  <div style={{
                    background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:'4px 16px 16px 16px', padding:'10px 14px',
                    display:'flex', gap:5, alignItems:'center',
                  }}>
                    {[0,1,2].map(i => (
                      <motion.span key={i}
                        style={{ width:6, height:6, borderRadius:'50%', background:'#6366f1', display:'inline-block' }}
                        animate={{ y:[0,-4,0] }}
                        transition={{ duration:0.6, repeat:Infinity, delay:i*0.15 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick chips */}
            <div style={{
              padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap',
              scrollbarWidth: 'none',
            }}>
              {QUICK.map(chip => (
                <button
                  key={chip.q}
                  onClick={() => send(chip.q)}
                  style={{
                    flexShrink: 0, fontSize: 11, padding: '4px 10px',
                    background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                    borderRadius: 20, color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { (e.target as HTMLElement).style.background='rgba(139,92,246,0.25)'; }}
                  onMouseOut={e => { (e.target as HTMLElement).style.background='rgba(139,92,246,0.12)'; }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} style={{
              padding: '10px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', gap: 8,
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Posez votre question douanière..."
                disabled={typing}
                style={{
                  flex: 1, padding: '9px 14px', borderRadius: 24,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f1f5f9', fontSize: 12.5, outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: input.trim() && !typing
                    ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)'
                    : 'rgba(255,255,255,0.08)',
                  cursor: input.trim() && !typing ? 'pointer' : 'default',
                  fontSize: 14, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                ➤
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
