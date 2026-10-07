import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getStudentMatch } from "@/lib/match-data";
import { PageHead, Empty } from "@/components/ui";
import TalentField, { type TalentNode } from "@/components/talent-field";
import type { TaskStatus } from "@/generated/prisma/enums";

type MatchTask = {
  id: string; difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED"; deadline: Date;
  estimatedHours: number; workMode: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null; skills: { skill: { name: string } }[];
};

const status: TaskStatus[] = ["OPEN"];

export const dynamic = "force-dynamic";

async function loadNodes(task: MatchTask) {
  const students = await db.user.findMany({
    where: { role: "STUDENT", isActive: true },
    select: {
      id: true, name: true, avatarUrl: true, isDemo: true, verificationStatus: true,
      skills: { include: { skill: true } },
    },
    orderBy: { name: "asc" },
  });
  // Batched: one query for every student's skills above, and matches resolved together.
  const matches = await Promise.all(students.map((s) => getStudentMatch(s.id, task)));
  const nodes: TalentNode[] = students.map((s, index) => {
    const m = matches[index];
    const ratingComponent = m.breakdown.find((b) => b.key === "rating")?.value ?? 50;
    const relevanceComponent = m.breakdown.find((b) => b.key === "past_task_relevance")?.value ?? 0;
    return {
      id: s.id, name: s.name, avatarUrl: s.avatarUrl, isDemo: s.isDemo,
      verificationStatus: s.verificationStatus, skills: s.skills.map((sk) => sk.skill.name),
      score: m.score, ratingComponent, relevanceComponent, match: m,
    };
  });
  return nodes.sort((a, b) => b.score - a.score);
}

export default async function Explore({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const p = await searchParams;
  const user = await currentUser();
  const openTasks = await db.task.findMany({
    where: { status: { in: status }, deadline: { gt: new Date() } },
    include: { client: true, skills: { include: { skill: true } } },
    orderBy: { createdAt: "desc" },
  });
  const selectedTaskId = p.task || openTasks[0]?.id;
  const task = openTasks.find((t) => t.id === selectedTaskId);
  if (!task) {
    return (
      <div className="container">
        <PageHead eyebrow="Talent discovery" title="Talent Field" description="Students matched to a task, ranked by evidence." />
        <Empty title="No open tasks">Post a task first, then match verified students.</Empty>
      </div>
    );
  }

  // MatchTask expects location: string | null; Task.location is a String column. Cast.
  const matchTask: MatchTask = {
    id: task.id, difficulty: task.difficulty, deadline: task.deadline,
    estimatedHours: task.estimatedHours, workMode: task.workMode,
    location: task.location || null, skills: task.skills as MatchTask["skills"],
  };
  const nodes = await loadNodes(matchTask);

  return (
    <div className="container">
      <PageHead
        eyebrow="Talent discovery"
        title="Talent Field"
        description="Drag the map to pan, scroll to zoom, click a node to inspect an evidence-backed match."
        action={
          <form className="task-picker" action="/explore">
            <label className="field" htmlFor="task">Task</label>
            <select id="task" name="task" defaultValue={selectedTaskId}>
              {openTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <button className="button small" type="submit">Match</button>
          </form>
        }
      />
      <div className="field-layout">
        <Suspense fallback={<Empty title="Mapping talent…">Computing matches against seeded evidence.</Empty>}>
          <TalentField nodes={nodes} />
        </Suspense>
        <section className="panel ranked-list" aria-label="Ranked student list">
          <h3>Ranked by match</h3>
          <p className="muted text-small">
            Same scores the map uses. Keyboard-navigable fallback for screen readers and slow networks.
          </p>
          <div className="stack">
            {nodes.map((n) => (
              <article key={n.id} className="list-item row between">
                <div className="row" style={{ gap: 12 }}>
                  <span className="avatar" title={n.verificationStatus}>{n.name.slice(0, 1)}</span>
                  <div>
                    <strong>{n.name}</strong>
                    <p className="muted text-small">{n.skills.slice(0, 3).join(", ")}</p>
                  </div>
                </div>
                <div className="row between" style={{ gap: 16, minWidth: 160 }}>
                  <strong className="match-number">{n.score}% match</strong>
                  <Link href={`/students/${n.id}`} className="round-link" aria-label={`View ${n.name}`}>↗</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      {user ? null : (
        <p className="muted text-small" style={{ marginTop: 24 }}>
          Talent Field is public discovery. Sign in to apply, hire, and build career proof.
        </p>
      )}
    </div>
  );
}
