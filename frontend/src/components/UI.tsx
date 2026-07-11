import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import { riskColor, riskLabel } from '../services/api';

// ── Animated KPI Card ─────────────────────────────────────────────────────────
interface KPIProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  sub?: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  color?: 'accent' | 'gold' | 'danger' | 'success' | 'teal' | 'purple';
  icon?: string;
  animate?: boolean;
}

const COLOR_MAP = {
  accent:  { top: '#3b82f6', glow: 'rgba(59,130,246,0.2)',  text: '#60a5fa'  },
  gold:    { top: '#f59e0b', glow: 'rgba(245,158,11,0.2)',  text: '#fbbf24'  },
  danger:  { top: '#ef4444', glow: 'rgba(239,68,68,0.2)',   text: '#f87171'  },
  success: { top: '#10b981', glow: 'rgba(16,185,129,0.2)',  text: '#34d399'  },
  teal:    { top: '#06b6d4', glow: 'rgba(6,182,212,0.2)',   text: '#22d3ee'  },
  purple:  { top: '#8b5cf6', glow: 'rgba(139,92,246,0.2)',  text: '#a78bfa'  },
};

export const KPICard: React.FC<KPIProps> = ({
  label, value, prefix = '', suffix = '', sub, delta, deltaDir, color = 'accent', icon, animate = true
}) => {
  const cm = COLOR_MAP[color];
  const isNumber = typeof value === 'number';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass-card rounded-2xl p-5 relative overflow-hidden group"
      style={{ boxShadow: `0 4px 24px ${cm.glow}` }}
      whileHover={{ scale: 1.02, boxShadow: `0 8px 32px ${cm.glow}` }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, transparent, ${cm.top}, transparent)` }} />

      {/* Background glow blob */}
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity"
        style={{ background: cm.top }} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>{label}</div>
          {icon && <span className="text-lg opacity-60">{icon}</span>}
        </div>

        <div className="text-2xl font-black number-ticker mb-1" style={{ color: cm.text }}>
          {isNumber && animate ? (
            <CountUp end={value as number} duration={2} separator=" " prefix={prefix} suffix={suffix}
              useEasing easingFn={(t, b, c, d) => { t /= d; return c * t * t * t + b; }} />
          ) : (
            <span>{prefix}{value}{suffix}</span>
          )}
        </div>

        {sub && <div className="text-xs mt-1" style={{ color: '#475569' }}>{sub}</div>}
        {delta && (
          <div className={`text-xs font-semibold mt-1.5 flex items-center gap-1 ${deltaDir === 'up' ? 'text-emerald-400' : deltaDir === 'down' ? 'text-red-400' : 'text-slate-500'}`}>
            {deltaDir === 'up' ? '▲' : deltaDir === 'down' ? '▼' : '●'} {delta}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Animated Gauge Bar ────────────────────────────────────────────────────────
export const Gauge: React.FC<{ value: number; color?: string; height?: string; delay?: number }> = ({
  value, color, height = 'h-1.5', delay = 0
}) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(100, value)), delay * 1000 + 100);
    return () => clearTimeout(t);
  }, [value, delay]);
  const bg = color ?? riskColor(value);
  return (
    <div className={`gauge-track ${height}`}>
      <div className="gauge-fill" style={{ width: `${width}%`, background: bg }} />
    </div>
  );
};

// ── Risk Badge ─────────────────────────────────────────────────────────────────
export const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  const label = riskLabel(score);
  const cls = score >= 80 ? 'badge-danger' : score >= 60 ? 'badge-warning' : score >= 40 ? 'badge-purple' : 'badge-success';
  return <span className={`badge ${cls}`}>{label}</span>;
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, [string, string]> = {
    CONFIRMED: ['badge-danger','CONFIRMÉ'], UNDER_REVIEW: ['badge-purple','EN RÉVISION'],
    SUSPECTED: ['badge-warning','SUSPECTÉ'], HIGH: ['badge-danger','ÉLEVÉ'],
    MEDIUM: ['badge-warning','MOYEN'], LOW: ['badge-success','FAIBLE'],
    RISING: ['badge-success','EN HAUSSE'], STABLE: ['badge-info','STABLE'],
    DECLINING: ['badge-danger','EN BAISSE'],
  };
  const [cls, lbl] = map[status] ?? ['badge-muted', status];
  return <span className={`badge ${cls}`}>{lbl}</span>;
};

// ── Section Title ─────────────────────────────────────────────────────────────
export const SectionTitle: React.FC<{ icon?: string; children: React.ReactNode; action?: React.ReactNode }> = ({ icon, children, action }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2 text-sm font-bold text-white">
      {icon && <span className="text-base">{icon}</span>}{children}
    </div>
    {action}
  </div>
);

// ── Loading skeleton ──────────────────────────────────────────────────────────
export const Loading: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <motion.div key={i} className="h-12 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)' }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }} />
    ))}
  </div>
);

// ── Error ─────────────────────────────────────────────────────────────────────
export const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
    className="glass-card rounded-2xl p-5 border-red-900/50 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
    <span className="text-2xl">⚠️</span>
    <div className="flex-1 text-sm text-red-400">{message}</div>
    {onRetry && <button onClick={onRetry} className="btn btn-ghost text-xs">Réessayer</button>}
  </motion.div>
);

// ── Code chip ─────────────────────────────────────────────────────────────────
export const Code: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = '#22d3ee' }) => (
  <code style={{ color, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: 'rgba(6,182,212,0.08)', padding: '1px 5px', borderRadius: 4 }}>{children}</code>
);

// ── Animated number ───────────────────────────────────────────────────────────
export const AnimatedNumber: React.FC<{ value: number; prefix?: string; suffix?: string; decimals?: number; color?: string }> = ({
  value, prefix = '', suffix = '', decimals = 0, color = '#f1f5f9'
}) => (
  <span className="number-ticker font-black" style={{ color }}>
    <CountUp end={value} duration={2.2} separator=" " prefix={prefix} suffix={suffix} decimals={decimals}
      useEasing easingFn={(t, b, c, d) => { t /= d; return c * (1 - Math.pow(1 - t, 3)) + b; }} />
  </span>
);

// ── Particle Background ───────────────────────────────────────────────────────
export const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5, opacity: Math.random() * 0.4 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59,130,246,${p.opacity})`;
        ctx.fill();
      });
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(59,130,246,${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} id="particle-canvas" />;
};

// ── Fade In wrapper ───────────────────────────────────────────────────────────
export const FadeIn: React.FC<{ children: React.ReactNode; delay?: number; direction?: 'up' | 'down' | 'left' | 'right'; className?: string }> = ({
  children, delay = 0, direction = 'up', className = ''
}) => {
  const dirMap = { up: { y: 24 }, down: { y: -24 }, left: { x: 24 }, right: { x: -24 } };
  return (
    <motion.div className={className} initial={{ opacity: 0, ...dirMap[direction] }} animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] }}>
      {children}
    </motion.div>
  );
};

// ── Stagger container ─────────────────────────────────────────────────────────
export const StaggerGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <motion.div className={className}
    initial="hidden" animate="visible"
    variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>
    {React.Children.map(children, child =>
      <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}>
        {child}
      </motion.div>
    )}
  </motion.div>
);

// ── Metric Row ────────────────────────────────────────────────────────────────
export const MetricRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = '#f1f5f9' }) => (
  <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
    <span className="text-xs" style={{ color: '#475569' }}>{label}</span>
    <span className="text-sm font-bold number-ticker" style={{ color }}>{value}</span>
  </div>
);

// ── Paginated scrollable table wrapper ───────────────────────────────────────
export const PaginatedTable: React.FC<{
  rows: React.ReactNode[];
  headers: React.ReactNode;
  pageSize?: number;
  className?: string;
}> = ({ rows, headers, pageSize = 15, className = '' }) => {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / pageSize);
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div className={className}>
      <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
        <table className="tbl" style={{ minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{
              position: 'sticky', top: 0, zIndex: 10,
            }}>
              {/* Render header cells with sticky background applied per-cell */}
              {React.Children.map(
                (headers as React.ReactElement)?.props?.children,
                (th: React.ReactElement) => th ? React.cloneElement(th, {
                  style: {
                    ...th.props?.style,
                    position: 'sticky', top: 0, zIndex: 10,
                    background: 'rgba(15,23,42,0.98)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(59,130,246,0.25)',
                    boxShadow: '0 1px 0 rgba(59,130,246,0.15)',
                  }
                }) : null
              )}
            </tr>
          </thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-muted">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} sur {rows.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="btn btn-ghost text-xs py-0.5 px-2 disabled:opacity-30"
            >«</button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn btn-ghost text-xs py-0.5 px-2 disabled:opacity-30"
            >‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`btn text-xs py-0.5 px-2.5 ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                >{p + 1}</button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="btn btn-ghost text-xs py-0.5 px-2 disabled:opacity-30"
            >›</button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page === totalPages - 1}
              className="btn btn-ghost text-xs py-0.5 px-2 disabled:opacity-30"
            >»</button>
          </div>
          <span className="text-xs text-muted">Page {page + 1}/{totalPages}</span>
        </div>
      )}
    </div>
  );
};

