"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MatchBreakdown } from "@/components/ui";
import type { MatchResult } from "@/lib/matching";

export type TalentNode = {
  id: string; name: string; avatarUrl?: string | null; isDemo: boolean;
  verificationStatus: string; skills: string[];
  score: number; ratingComponent: number; relevanceComponent: number;
  match: MatchResult;
};

export default function TalentField({ nodes }: { nodes: TalentNode[] }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const panRef = useRef<{ x: number; y: number; down: boolean }>({ x: 0, y: 0, down: false });
  const svgRef = useRef<SVGSVGElement>(null);

  const { width, height, pad } = { width: 780, height: 420, pad: 60 };

  const positions = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        x: pad + ((n.score * (width - pad * 2)) / 100) * scale + offset.x,
        y: pad + ((1 - n.ratingComponent / 100) * (height - pad * 2)) * scale + offset.y,
        r: 6 + (n.score / 100) * 8 + n.skills.length * 0.6,
      })),
    [nodes, scale, offset, width, height, pad],
  );

  function onWheel(e: React.WheelEvent) {
    const delta = -e.deltaY * 0.002;
    const next = Math.min(1.6, Math.max(0.4, scale * (1 + delta)));
    setScale(next);
    e.preventDefault();
  }
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, y: e.clientY, down: true };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!panRef.current.down) return;
    setOffset((o) => ({ x: o.x + e.clientX - panRef.current.x, y: o.y + e.clientY - panRef.current.y }));
    panRef.current.x = e.clientX;
    panRef.current.y = e.clientY;
  }
  function onPointerUp(e: React.PointerEvent) {
    panRef.current.down = false;
    (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
  }

  const focus = selected ? nodes.find((n) => n.id === selected) ?? nodes[0] : null;

  return (
    <div className="talent-field">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="img"
        aria-label="Student talent map; drag to pan, scroll to zoom, click a node to inspect."
      >
        <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} className="field-bg" />
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
        <text x={pad} y={height - pad + 34} className="axis-label">Skill fit (match %)</text>
        <text x={18} y={pad} className="axis-label" transform="rotate(-90 18 40)">Trust (client rating %)</text>
        {positions.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              className={focus?.id === n.id ? "node node-selected" : "node"}
              onClick={() => setSelected((s) => (s === n.id ? null : n.id))}
              tabIndex={0}
              role="button"
              aria-label={`${n.name}, ${n.score}% match`}
              onKeyDown={(e) => e.key === "Enter" && setSelected((s) => (s === n.id ? null : n.id))}
            />
            {focus?.id === n.id && (
              <foreignObject x={n.x + n.r + 14} y={Math.min(n.y - 40, height - pad - 80)} width={260} height={140}>
                <div className="node-callout">
                  <Link href={`/students/${n.id}`} className="callout-title">{n.name}</Link>
                  <p className="text-small muted">{n.skills.slice(0, 3).join(", ")}</p>
                  <button className="button small" onClick={() => setSelected(null)}>Close</button>
                </div>
              </foreignObject>
            )}
          </g>
        ))}
      </svg>
      {focus && (
        <div className="breakdown-wrap">
          <h4>{focus.name}</h4>
          <MatchBreakdown match={focus.match} />
        </div>
      )}
    </div>
  );
}
