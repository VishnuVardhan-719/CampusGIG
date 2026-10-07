import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, Empty } from "@/components/ui";
import RankedList from "@/components/ranked-list";
import Reveal from "@/components/reveal";
import { loadBuilders, type RankedBuilder } from "@/lib/rank-data";
import { BUILDER_COMPONENTS } from "@/lib/rankers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ranked builders",
  description: "Student builders ranked on reviews, on-time delivery, completed contracts and contract-backed skill evidence.",
};

const stat = (builder: RankedBuilder) => [
  ["completed", String(builder.completedContracts)],
  ["on time", builder.onTimeRate === null ? "Unknown" : `${builder.onTimeRate}%`],
  ["rating", builder.ratingAverage === null ? "Unknown" : `${builder.ratingAverage} / 5`],
  [builder.reviewCount === 1 ? "review" : "reviews", String(builder.reviewCount)],
  [builder.evidencedSkills === 1 ? "evidenced skill" : "evidenced skills", String(builder.evidencedSkills)],
] as const;

export default async function Rankings() {
  const { ranked, awaiting, students } = await loadBuilders();
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="container">
      <PageHead
        eyebrow="Career proof"
        title="The proof board"
        description="Ranked from real platform records: client reviews on completed contracts, on-time delivery, finished work, and contract-backed skill evidence. Recomputed from database state on every visit — no number here is typed into the page."
      />

      <section className="panel" aria-label="How the evidence index works">
        <h3>How the evidence index works</h3>
        <p className="muted text-small">
          {ranked.length} ranked of {students} active student{students === 1 ? "" : "s"}.
          A builder is ranked only once a client review exists on a completed contract. Signals the
          platform has not observed yet are excluded from the total and labelled unknown — never counted as zero.
          This is an evidence index, not a certification, a guarantee, or a measure of a person&apos;s potential.
        </p>
        <div className="weights">
          {BUILDER_COMPONENTS.map((component) => (
            <div key={component.key}>
              <strong>{component.label} · {Math.round(component.weight * 100)}%</strong>
              <span className="muted">{component.description}</span>
            </div>
          ))}
        </div>
      </section>

      {students === 0 ? (
        <Empty title="No builders to rank yet">Rankings appear once students hold verified platform records.</Empty>
      ) : (
        <>
          {podium.length > 0 && (
            <>
              <div className="section-head"><h2>Top reviewed builders</h2><span className="muted text-small">Ranked by evidence index</span></div>
              <div className="podium">
                {podium.map((builder, index) => (
                  <Reveal key={builder.id} className={`podium-card${index === 0 ? " first" : ""}`} delayMs={index * 90}>
                    <p className="podium-rank">Rank {index + 1}</p>
                    <h3><Link href={`/students/${builder.id}`}>{builder.name}</Link></h3>
                    <p className="muted text-small">{builder.degree}{builder.degree && builder.college ? " · " : ""}{builder.college}</p>
                    <p className="podium-value">{builder.score}<small className="muted"> / 100</small></p>
                    <span className="rank-meter" aria-hidden="true"><span style={{ "--fill": `${builder.score ?? 0}%` } as React.CSSProperties} /></span>
                    <p className="podium-meta">
                      {stat(builder).map(([label, value]) => <span key={label}><strong>{value}</strong> {label}</span>)}
                    </p>
                    <span className="tags">
                      {builder.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}
                      {builder.verificationStatus === "VERIFIED" && <span>Verified status</span>}
                      {builder.isDemo && <span>Demo profile</span>}
                    </span>
                    <Link href={`/students/${builder.id}`} className="back-link" style={{ margin: 0 }}>View work evidence ↗</Link>
                  </Reveal>
                ))}
              </div>
            </>
          )}

          {rest.length > 0 && (
            <>
              <div className="section-head"><h2>Ranked builders</h2><span className="muted text-small">Position {podium.length + 1} onward</span></div>
              <RankedList builders={rest} startRank={podium.length + 1} />
            </>
          )}

          {awaiting.length > 0 && (
            <>
              <div className="section-head"><h2>Awaiting a first review</h2><span className="muted text-small">No published index yet</span></div>
              <p className="muted text-small" style={{ marginBottom: 18 }}>
                These students have platform accounts but no client review on a completed contract, so no index is
                published for them. Missing history is unknown, not zero quality.
              </p>
              <div className="stack" style={{ gap: 10 }}>
                {awaiting.map((builder, index) => (
                  <Reveal key={builder.id} className="awaiting-row" delayMs={(index % 6) * 70}>
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
                      {stat(builder).filter(([label]) => label !== "review" && label !== "reviews").map(([label, value]) => (
                        <span key={label}><strong>{value}</strong> {label}</span>
                      ))}
                    </span>
                    <span className="rank-score">
                      <strong className="muted text-small">No reviews yet</strong>
                      <small className="muted">Index unpublished</small>
                    </span>
                  </Reveal>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
