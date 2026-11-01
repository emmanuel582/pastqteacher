import { useEffect, useState } from 'react';
import {
  Plus,
  ArrowRight,
  ArrowUpRight,
  Upload,
  Files,
  Users,
  Check,
  ChartNoAxesCombined,
  GraduationCap,
} from 'lucide-react';
import { request } from '../data';

import {
  Heading,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Stat,
  MiniBar,
  percent,
} from '../components';
export default function Overview({ exams, resource, profile, go, version }) {
  const [reports, setReports] = useState([]),
    [reportError, setReportError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all(
      exams
        .filter((e) => e.status !== 'draft')
        .map((e) =>
          request(`/teacher/exams/${e.id}/analysis`).then((report) => ({ exam: e, report })),
        ),
    )
      .then((data) => {
        if (active) {
          setReports(data);
          setReportError('');
        }
      })
      .catch((error) => {
        if (active) setReportError(error.message);
      });
    return () => {
      active = false;
    };
  }, [version, exams.map((e) => e.id).join(',')]);
  const attempts = reports.reduce((s, r) => s + r.report.attempts, 0),
    students = new Set(reports.flatMap((r) => r.report.students.map((s) => s.userId))).size;
  const scored = reports.filter((r) => r.report.average !== null),
    average = scored.length
      ? scored.reduce(
          (s, r) => s + r.report.average * (r.report.gradedAttempts ?? r.report.attempts),
          0,
        ) / scored.reduce((s, r) => s + (r.report.gradedAttempts ?? r.report.attempts), 0)
      : null;
  const weak = reports
    .flatMap((r) =>
      r.report.topics
        .filter((t) => t.accuracy !== null && t.accuracy < 65)
        .map((t) => ({ ...t, examId: r.exam.id })),
    )
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
  return (
    <>
      <Heading
        eyebrow="TEACHER WORKSPACE"
        title={`Hi, ${profile.name.split(' ')[0]}.`}
        text="Manage exams and review student performance."
        action={
          <Button variant="primary" icon={Plus} onClick={() => go('exams/new')}>
            Create exam
          </Button>
        }
      />
      <ErrorBox error={resource.error || reportError} />
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">EXAM CREATION</span>
          <h2>Add exam questions</h2>
          <p>Upload a paper or choose from PastQ.</p>
          <div className="inline-actions">
            <Button variant="primary" icon={Upload} onClick={() => go('uploads')}>
              Upload paper
            </Button>
            <button className="text-btn" onClick={() => go('library')}>
              Browse library <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          label="Published exams"
          value={exams.filter((e) => e.status === 'open').length}
          foot={`${exams.filter((e) => e.status === 'draft').length} drafts waiting for you`}
          icon={Files}
        />
        <Stat
          label="Students reached"
          value={students}
          foot="Across your exam sessions"
          icon={Users}
        />
        <Stat
          label="Completed attempts"
          value={attempts}
          foot="Across your published exams"
          icon={Check}
        />
        <Stat
          label="Average score"
          value={percent(average)}
          foot="From graded exam attempts"
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="overview-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">EXAM SESSIONS</span>
              <h2>Recent exams</h2>
            </div>
            <button className="text-btn" onClick={() => go('exams')}>
              View all <ArrowRight size={15} />
            </button>
          </div>
          {resource.loading ? (
            <Loading />
          ) : !exams.length ? (
            <Empty
              title="No exams yet"
              text="Upload a paper or choose questions from the PastQ library."
              action={
                <Button icon={Plus} onClick={() => go('exams/new')}>
                  Create exam
                </Button>
              }
            />
          ) : (
            <div className="recent-list">
              {exams.slice(0, 4).map((e) => (
                <button key={e.id} className="exam-row" onClick={() => go(`exams/${e.id}`)}>
                  <span className="exam-icon">
                    <Files size={22} strokeWidth={1.4} />
                  </span>
                  <span className="grow">
                    <strong>{e.title}</strong>
                    <small>
                      {e.questionCount} questions <i /> {e.settings.durationMinutes} min <i />{' '}
                      {e.visibility === 'private' ? 'Private' : 'Public'}
                    </small>
                  </span>
                  <Badge status={e.status} />
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel learning-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">TOPIC PERFORMANCE</span>
              <h2>Topics to revisit</h2>
            </div>
            <span className="accent-symbol">✳</span>
          </div>
          {weak.length ? (
            <>
              <p className="panel-copy">Lowest-scoring topics across your exams.</p>
              {weak.map((t, i) => (
                <button className="topic-focus" key={i} onClick={() => go(`exams/${t.examId}`)}>
                  <span>
                    <strong>{t.topic}</strong>
                    <small>
                      {t.subject} · {t.students} students to support
                    </small>
                  </span>
                  <span className="topic-percent">
                    {percent(t.accuracy)}
                    <MiniBar value={t.accuracy} />
                  </span>
                </button>
              ))}
              <button className="text-btn" onClick={() => go('insights')}>
                See learning insights <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <Empty
              title="No topic results yet"
              text="Once students complete an exam, their topic insights appear here."
              icon={ChartNoAxesCombined}
            />
          )}
        </section>
      </div>
      <div className="bottom-note">
        <span className="note-icon">
          <GraduationCap size={20} />
        </span>
        <span>
          <strong>Plan the next practice session.</strong>
          <small>Use student results to choose questions for a follow-up exam.</small>
        </span>
        <button className="text-btn" onClick={() => go('library')}>
          Find practice questions <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
