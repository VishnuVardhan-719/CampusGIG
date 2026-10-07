"use client";
import Link from "next/link";
import Reveal from "@/components/reveal";
import type { RankedBuilder } from "@/lib/rank-data";

/**
 * Ranked builder rows with a staggered entrance. Every number arrives already computed
 * from the database by the server; this component only animates the presentation, so a
 * disabled or slow browser still shows the real values.
 */
export default function RankedList({ builders, startRank = 1 }: { builders: RankedBuilder[]; startRank?: number }) {
  return (
    <ol className="rank-list">
      {builders.map((builder, index) => (
        <li key={builder.id}>
          <Reveal className="rank-row" delayMs={(index % 6) * 70}>
            <span className="rank-number" aria-hidden="true">{startRank + index}</span>
            <span className="avatar" aria-hidden="true">{builder.name.slice(0, 1)}</span>
            <span className="rank-identity">
              <Link href={`/students/${builder.id}`} className="rank-name">{builder.name}</Link>
              <small className="muted">{builder.degree}{builder.degree && builder.college ? " · " : ""}{builder.college}</small>
              <span className="tags">
                {builder.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}
                {builder.isDemo && <span>Demo profile</span>}
              </span>
            </span>
            <span className="rank-stats">
              <span><strong>{builder.completedContracts}</strong> completed</span>
              <span><strong>{builder.onTimeRate === null ? "Unknown" : `${builder.onTimeRate}%`}</strong> on time</span>
              <span><strong>{builder.ratingAverage === null ? "Unknown" : `${builder.ratingAverage} / 5`}</strong> rating</span>
              <span><strong>{builder.evidencedSkills}</strong> evidenced skills</span>
            </span>
            <span className="rank-score">
              <strong className="rank-value">{builder.score}</strong>
              <span className="rank-meter" aria-hidden="true"><span style={{ "--fill": `${builder.score ?? 0}%` } as React.CSSProperties} /></span>
              <small className="muted">evidence index · {builder.reviewCount} review{builder.reviewCount === 1 ? "" : "s"}</small>
            </span>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}
