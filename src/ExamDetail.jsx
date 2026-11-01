import { StudentCards, QuestionCards } from './ResultCards';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Copy,
  Download,
  Eye,
  Files,
  GraduationCap,
  RefreshCw,
  Settings2,
  Users,
} from 'lucide-react';
import { request, useResource } from './data';

import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  MiniBar,
  Modal,
  SourceContent,
  RichContent,
  Stat,
  money,
  percent,
  when,
} from './components';
import { exportCsv, mediaUrl } from './api';
import { LibraryPicker } from './Library';
export default function ExamDetail({ id, go, notify = () => {}, version = 0, embedded }) {
  const [tick, setTick] = useState(0),
    resource = useResource(`/teacher/exams/${id}`, version + tick),
    analysis = useResource(`/teacher/exams/${id}/analysis`, version + tick);
  const [tab, setTab] = useState(embedded || 'overview'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(''),
    [student, setStudent] = useState(null),
    [attemptId, setAttemptId] = useState(null),
    [preview, setPreview] = useState(false),
    [library, setLibrary] = useState(null);
  const exam = resource.data,
    report = analysis.data;
  async function act(action) {
    setBusy(true);
    setError('');
    try {
      let result;
      if (action === 'duplicate') {
        result = await request(`/teacher/exams/${id}/duplicate`, { method: 'POST' });
        notify('A fresh draft is ready.');
        go(`exams/${result.id}/edit`);
      } else if (action === 'publish') {
        await request(`/teacher/exams/${id}/publish`, { method: 'POST' });
        notify('Your exam is published.');
      } else if (action === 'rotate') {
        await request(`/teacher/exams/${id}/rotate-code`, { method: 'POST' });
        notify('A new private code is ready. Existing students keep access.');
      } else {
        await request(`/teacher/exams/${id}/action`, { method: 'POST', body: { action } });
        notify(action === 'release' ? 'Results released to students.' : 'Exam updated.');
      }
      setTick((t) => t + 1);
      setConfirm('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      notify('Copied to clipboard.');
    } catch {
      setError('Clipboard unavailable. Select the displayed code to copy it.');
    }
  }
  async function remediate(bundleId, indexes) {
    setBusy(true);
    setError('');
    try {
      const draft = await request('/teacher/exams', {
        method: 'POST',
        body: {
          title: `${exam.title.slice(0, 110)} · focused practice`,
          description: 'A follow-up exam focused on topics worth revisiting.',
          subject: exam.subject,
          visibility: exam.visibility,
          priceMinor: 0,
          currency: exam.currency,
          questions: [],
          settings: {
            ...exam.settings,
            startsAt: null,
            endsAt: null,
            maxAttempts: 3,
            resultRelease: 'immediate',
            showSolutions: true,
          },
        },
      });
      await request(`/teacher/exams/${draft.id}/import-library`, {
        method: 'POST',
        body: { bundleId, indexes, revision: draft.revision },
      });
      setLibrary(null);
      notify('Focused practice draft created. Review it before sharing.');
      go(`exams/${draft.id}/edit`);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <ErrorBox error={resource.error} retry={() => setTick((t) => t + 1)} />;
  if (!exam) return null;
  return (
    <>
      {!embedded && (
        <>
          <button className="back-link" onClick={() => go('exams')}>
            <ArrowLeft size={15} />
            Back to exams
          </button>
          <div className="detail-heading">
            <div className="detail-identity">
              <span className="exam-icon large">
                {exam.logo ? (
                  <img src={mediaUrl(exam.logo)} alt="" />
                ) : (
                  <Files size={29} strokeWidth={1.2} />
                )}
              </span>
              <div>
                <div className="inline-badges">
                  <Badge status={exam.status} />
                  <Badge status={exam.visibility} />
                  <span>{exam.subject}</span>
                </div>
                <h1>{exam.title}</h1>
                <p>{exam.description || 'Manage access, questions, and results for this exam.'}</p>
              </div>
            </div>
            <div className="inline-actions">
              <Button icon={Eye} onClick={() => setPreview(true)}>
                Preview
              </Button>
              {exam.status === 'draft' ? (
                <Button variant="primary" icon={Settings2} onClick={() => go(`exams/${id}/edit`)}>
                  Edit draft
                </Button>
              ) : (
                <Button icon={Copy} disabled={busy} onClick={() => act('duplicate')}>
                  Duplicate
                </Button>
              )}
            </div>
          </div>
          <nav className="tabs detail-tabs" aria-label="Exam details">
            {[
              ['overview', 'Overview'],
              ['questions', 'Questions'],
              ['students', 'Students & results'],
              ['analysis', 'Topic insights'],
              ['recommendations', 'What’s next'],
            ].map(([value, label]) => (
              <button
                className={tab === value ? 'active' : ''}
                key={value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </nav>
        </>
      )}
      <ErrorBox error={error || analysis.error} />
      {tab === 'overview' ? (
        <>
          <div className="stats-grid">
            <Stat
              label="Students enrolled"
              value={report?.enrolled ?? '—'}
              foot="Enrolled in this exam"
              icon={Users}
            />
            <Stat
              label="Completed attempts"
              value={report?.attempts ?? '—'}
              foot={`${report?.completedStudents ?? 0} students have submitted`}
              icon={Check}
            />
            <Stat
              label="Average score"
              value={percent(report?.average)}
              foot="Fully graded attempts"
              icon={GraduationCap}
            />
            <Stat
              label="Pass rate"
              value={percent(report?.passRate)}
              foot={`Against a ${exam.settings.passMark}% pass mark`}
              icon={ArrowUpRight}
            />
          </div>
          <div className="detail-columns">
            <section className="panel padded">
              <div className="panel-heading">
                <h2>Exam details</h2>
                <Clock3 size={20} />
              </div>
              <dl className="exam-facts">
                <div>
                  <dt>Questions</dt>
                  <dd>{exam.questions.length}</dd>
                </div>
                <div>
                  <dt>Time allowed</dt>
                  <dd>{exam.settings.durationMinutes} minutes</dd>
                </div>
                <div>
                  <dt>Attempts per student</dt>
                  <dd>{exam.settings.maxAttempts}</dd>
                </div>
                <div>
                  <dt>Entry</dt>
                  <dd>{exam.priceMinor ? money(exam.priceMinor, exam.currency) : 'Free'}</dd>
                </div>
                <div>
                  <dt>Opens</dt>
                  <dd>{when(exam.settings.startsAt)}</dd>
                </div>
                <div>
                  <dt>Closes</dt>
                  <dd>{when(exam.settings.endsAt)}</dd>
                </div>
                <div>
                  <dt>Result release</dt>
                  <dd>
                    {
                      {
                        immediate: 'After submission and grading',
                        after_close: 'After exam closes',
                        manual: 'Released by you',
                      }[exam.settings.resultRelease]
                    }
                  </dd>
                </div>
                <div>
                  <dt>Solutions</dt>
                  <dd>
                    {exam.settings.showSolutions
                      ? 'Included with released results'
                      : 'Hidden from students'}
                  </dd>
                </div>
                <div>
                  <dt>Question shuffling</dt>
                  <dd>{exam.settings.shuffleQuestions ? 'On' : 'Off'}</dd>
                </div>
              </dl>
              {exam.settings.instructions && (
                <div className="exam-instructions">
                  <h3>Student instructions</h3>
                  <p>{exam.settings.instructions}</p>
                </div>
              )}
            </section>
            <div>
              <section className="panel padded share-panel">
                <span className="eyebrow">A SEAT AT THE EXAM</span>
                <h2>
                  {exam.visibility === 'private' ? 'Private exam access' : 'Public exam access'}
                </h2>
                <p>
                  {exam.status === 'draft'
                    ? 'Publish your exam when the questions and settings are ready.'
                    : exam.visibility === 'private'
                      ? 'Share this code with the students you want to invite. Paid entry still requires verified payment.'
                      : 'Your exam is available through public exam discovery. Students can enroll while it is open.'}
                </p>
                {exam.inviteCode && (
                  <>
                    <label className="invite-code">
                      Private exam code
                      <div>
                        <code>{exam.inviteCode.match(/.{1,4}/g).join(' ')}</code>
                        <button
                          className="icon-btn"
                          aria-label="Copy exam code"
                          onClick={() => copy(exam.inviteCode)}
                        >
                          <Copy size={17} />
                        </button>
                      </div>
                    </label>
                    <button
                      className="text-btn"
                      onClick={() => setConfirm('rotate')}
                      disabled={exam.status !== 'open'}
                    >
                      <RefreshCw size={14} />
                      Generate a new code
                    </button>
                  </>
                )}
                {exam.status === 'draft' && (
                  <Button
                    variant="primary"
                    icon={ArrowRight}
                    onClick={() => go(`exams/${id}/edit`)}
                  >
                    Continue building
                  </Button>
                )}
                <div className="exam-reference">
                  <small>Exam reference</small>
                  <code>{exam.id}</code>
                </div>
              </section>
              {exam.status !== 'draft' && exam.status !== 'archived' && (
                <section className="panel padded exam-controls">
                  <h3>Session controls</h3>
                  <Button
                    disabled={busy}
                    onClick={() => setConfirm(exam.status === 'open' ? 'close' : 'reopen')}
                  >
                    {exam.status === 'open' ? 'Close enrollment & new attempts' : 'Reopen exam'}
                  </Button>
                  <Button
                    disabled={busy || exam.resultsReleased}
                    onClick={() => setConfirm('release')}
                  >
                    {exam.resultsReleased ? 'Results released' : 'Release results now'}
                  </Button>
                  <button className="text-btn muted" onClick={() => setConfirm('archive')}>
                    Archive exam
                  </button>
                </section>
              )}
            </div>
          </div>
        </>
      ) : tab === 'questions' ? (
        <section className="panel padded">
          <div className="panel-heading">
            <div>
              <h2>Exam questions</h2>
              <p className="panel-copy">
                {exam.questions.length} questions ·{' '}
                {exam.questions.reduce((s, q) => s + q.marks, 0)} total marks
              </p>
            </div>
            {exam.status === 'draft' && (
              <Button onClick={() => go(`exams/${id}/edit`)}>
                Edit questions <ArrowRight size={15} />
              </Button>
            )}
          </div>
          {exam.questions.map((q, index) => (
            <article className="detail-question" key={q.key}>
              <div className="question-tags">
                <strong>QUESTION {index + 1}</strong>
                <span>{q.subject}</span>
                <span>{q.topic}</span>
                <span>{q.marks} marks</span>
              </div>
              <SourceContent question={q} assets={exam.assets} />
              {q.type === 'mcq' ? (
                <ol className="preview-options">
                  {q.options.map((o, i) => (
                    <li className={q.correct === i ? 'correct' : ''} key={i}>
                      <b>{String.fromCharCode(65 + i)}</b>
                      <RichContent text={o} html={q.optionsHtml?.[i]} assets={exam.assets} />
                      {q.correct === i && <Check size={15} />}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="explanation">
                  <strong>Marking guide</strong>
                  <RichContent
                    text={q.answerText || 'No marking guide supplied.'}
                    html={q.answerHtml}
                    assets={exam.assets}
                  />
                </div>
              )}
              {q.explanation && <p className="explanation">{q.explanation}</p>}
            </article>
          ))}
        </section>
      ) : tab === 'students' ? (
        analysis.loading ? (
          <Loading />
        ) : (
          report && <StudentTable report={report} onStudent={setStudent} />
        )
      ) : tab === 'analysis' ? (
        analysis.loading ? (
          <Loading />
        ) : (
          report && (
            <Analysis
              report={report}
              onPractice={() => (embedded ? setLibrary({}) : setTab('recommendations'))}
            />
          )
        )
      ) : (
        <Recommendations id={id} onPractice={setLibrary} version={version + tick} />
      )}
      {confirm && (
        <Modal
          title={
            {
              close: 'Close this exam?',
              reopen: 'Open the exam again?',
              release: 'Release these results?',
              archive: 'Archive this exam?',
              rotate: 'Generate a new invite code?',
            }[confirm]
          }
          onClose={() => setConfirm('')}
        >
          <p className="dialog-copy">
            {
              {
                close:
                  'Students can no longer enroll or start another attempt. Existing timed attempts keep their original deadline.',
                reopen:
                  'Students can enroll and take any remaining attempts within the original exam window.',
                release:
                  'Fully graded results become visible to enrolled students. Written responses still need their marks.',
                archive:
                  'This exam leaves discovery and stops accepting new attempts. Your results and existing attempts are preserved.',
                rotate:
                  'The old invite code stops working for new students. Already enrolled students keep their access.',
              }[confirm]
            }
          </p>
          <div className="modal-actions">
            <Button disabled={busy} onClick={() => setConfirm('')}>
              Keep as is
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => act(confirm)}>
              {busy ? 'Updating…' : 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
      {student && (
        <Modal wide title={student.name} subtitle={student.email} onClose={() => setStudent(null)}>
          <div className="student-summary">
            <Stat label="Completed attempts" value={student.attempts} />
            <Stat label="Best result" value={percent(student.best)} />
            <Stat
              label="Improvement"
              value={
                student.improvement === null
                  ? '—'
                  : `${student.improvement > 0 ? '+' : ''}${Math.round(student.improvement)} pts`
              }
            />
          </div>
          <h3>Topics to revisit</h3>
          <div className="topic-tags">
            {student.weakTopics.length ? (
              student.weakTopics.map((t) => <span key={t}>{t}</span>)
            ) : (
              <span>No graded gaps yet</span>
            )}
          </div>
          <h3>Attempt history</h3>
          {student.history.length ? (
            student.history.map((a, i) => (
              <div className="attempt-row" key={a.id}>
                <span className="attempt-number">{i + 1}</span>
                <span className="grow">
                  <strong>{a.pending ? 'Awaiting written grading' : percent(a.percent)}</strong>
                  <small>
                    {when(a.completedAt)} · {Math.floor(a.durationSeconds / 60)} min{' '}
                    {a.durationSeconds % 60}s
                  </small>
                </span>
                <Button onClick={() => setAttemptId(a.id)}>
                  Inspect answers <ArrowRight size={15} />
                </Button>
              </div>
            ))
          ) : (
            <p className="panel-copy">This student has not submitted an attempt yet.</p>
          )}
        </Modal>
      )}
      {attemptId && (
        <AttemptInspector
          id={attemptId}
          onClose={() => setAttemptId(null)}
          onSaved={() => {
            setTick((t) => t + 1);
            notify('Written marks saved.');
            setStudent(null);
          }}
        />
      )}{' '}
      {preview && <ExamPreview exam={exam} onClose={() => setPreview(false)} />}{' '}
      {library && (
        <LibraryPicker
          initialBundleId={library.bundleId}
          initialTopic={library.topic || ''}
          onClose={() => setLibrary(null)}
          onImport={remediate}
          busy={busy}
        />
      )}
    </>
  );
}
function StudentTable({ report, onStudent }) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const rows = report.students.filter(
    (s) =>
      `${s.name} ${s.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'pending' && s.pending) ||
        (filter === 'not-started' && !s.attempts) ||
        (filter === 'support' && s.weakTopics.length)),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BEHIND EVERY SCORE</span>
          <h2>Student results</h2>
        </div>
        <Button
          icon={Download}
          disabled={!report.students.length}
          onClick={() =>
            exportCsv(
              report.students.map(
                ({
                  userId,
                  name,
                  email,
                  attempts,
                  best,
                  latest,
                  totalSeconds,
                  improvement,
                  weakTopics,
                  pending,
                }) => ({
                  userId,
                  name,
                  email,
                  attempts,
                  best,
                  latest,
                  totalSeconds,
                  improvement,
                  weakTopics: weakTopics.join('; '),
                  pending,
                }),
              ),
              'student-results',
            )
          }
        >
          Export results
        </Button>
      </div>
      <div className="table-toolbar">
        <input
          aria-label="Search students"
          placeholder="Find a student by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={filter}
          aria-label="Filter student results"
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All students</option>
          <option value="support">Topics to revisit</option>
          <option value="pending">Needs grading</option>
          <option value="not-started">No completed attempt</option>
        </select>
      </div>
      {rows.length ? (
        <>
          <StudentCards rows={rows} onStudent={onStudent} />
          <div className="table-scroll student-results-table">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Attempts</th>
                  <th>Best score</th>
                  <th>Latest</th>
                  <th>Topics to revisit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.userId}>
                    <td>
                      <div className="student-cell">
                        <span className="avatar">
                          {s.name
                            .split(' ')
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join('')}
                        </span>
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {s.attempts}
                      {s.inProgress && <small>In progress</small>}
                    </td>
                    <td>
                      <span className="score-pill">{percent(s.best)}</span>
                    </td>
                    <td>
                      {s.pending ? <Badge status="draft">Needs grading</Badge> : percent(s.latest)}
                    </td>
                    <td>
                      <span className="truncate-cell">
                        {s.weakTopics.slice(0, 2).join(', ') || '—'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={`View ${s.name} results`}
                        onClick={() => onStudent(s)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty
          title={search || filter !== 'all' ? 'No matching students.' : 'No students enrolled'}
          text="When students join your exam, you can follow their attempts and see where they need support."
          icon={Users}
        />
      )}
    </section>
  );
}
function Analysis({ report, onPractice }) {
  return (
    <>
      <div className="stats-grid three">
        <Stat label="Average score" value={percent(report.average)} foot="Fully graded attempts" />
        <Stat
          label="Average time"
          value={
            report.averageSeconds === null ? '—' : `${Math.round(report.averageSeconds / 60)} min`
          }
          foot="Completed attempts"
        />
        <Stat
          label="Written grading"
          value={report.pendingGrading}
          foot="Attempts awaiting teacher marks"
        />
      </div>
      {!report.attempts ? (
        <Empty
          title="No submitted attempts"
          text="Topic and question analysis appears after students submit an attempt."
        />
      ) : (
        <>
          <div className="analysis-columns">
            <section className="panel padded">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">THE GAPS WORTH YOUR TIME</span>
                  <h2>Topic performance</h2>
                </div>
                <button className="text-btn" onClick={onPractice}>
                  Find practice <ArrowRight size={15} />
                </button>
              </div>
              {report.topics.map((t, index) => (
                <div className="topic-analysis" key={index}>
                  <div>
                    <strong>{t.topic}</strong>
                    <small>
                      {t.subject} · {t.students} students missed questions here
                    </small>
                  </div>
                  <span>{percent(t.accuracy)}</span>
                  <MiniBar value={t.accuracy} />
                  <small>
                    {t.correct} correct of {t.answered} graded responses · {t.unanswered} unanswered
                    {t.pending ? ` · ${t.pending} awaiting marks` : ''}
                  </small>
                </div>
              ))}
            </section>
            <section className="panel padded">
              <span className="eyebrow">THE WHOLE PICTURE</span>
              <h2>Score distribution</h2>
              <p className="panel-copy">Each completed, fully graded attempt.</p>
              <div className="distribution">
                {report.distribution.map((b) => (
                  <div key={b.label}>
                    <strong>{b.count}</strong>
                    <div>
                      <i
                        style={{
                          height: `${b.count ? Math.max(4, (b.count / Math.max(...report.distribution.map((v) => v.count), 1)) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <small>{b.label}</small>
                  </div>
                ))}
              </div>
              <div className="analysis-note">
                Use these results to choose topics for the next practice exam.
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LOOK A LITTLE CLOSER</span>
                <h2>Question performance</h2>
              </div>
              <Button
                icon={Download}
                onClick={() =>
                  exportCsv(
                    report.questions.map(({ choices, ...q }) => ({
                      ...q,
                      optionSelections: choices.join('; '),
                    })),
                    'question-analysis',
                  )
                }
              >
                Export
              </Button>
            </div>
            <QuestionCards rows={report.questions} />
            <div className="table-scroll question-performance-table">
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Topic</th>
                    <th>Correct</th>
                    <th>Unanswered</th>
                    <th>Option selections</th>
                  </tr>
                </thead>
                <tbody>
                  {report.questions.map((q) => (
                    <tr key={q.key}>
                      <td>
                        <span className="question-excerpt">{q.question}</span>
                      </td>
                      <td>{q.topic}</td>
                      <td>
                        <span className="score-inline">
                          {percent(q.accuracy)}
                          <MiniBar value={q.accuracy} />
                        </span>
                      </td>
                      <td>
                        {q.unanswered}/{q.seen}
                      </td>
                      <td>
                        <span className="distractors">
                          {q.choices.map((n, i) => (
                            <span key={i}>
                              {String.fromCharCode(65 + i)} <b>{n}</b>
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
function Recommendations({ id, onPractice, version }) {
  const resource = useResource(`/teacher/exams/${id}/recommendations`, version);
  return (
    <section className="panel padded">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">UNDERSTANDING INTO ACTION</span>
          <h2>Recommended practice</h2>
        </div>
        <span className="accent-symbol">✳</span>
      </div>
      <p className="panel-copy">
        Library matches are suggestions based on subjects and weak topics. Choose the individual
        questions before creating a follow-up exam.
      </p>
      <ErrorBox error={resource.error} />
      {resource.loading ? (
        <Loading label="Finding relevant collections…" />
      ) : (
        <>
          {resource.data?.topics.length > 0 && (
            <div className="topic-tags">
              {resource.data.topics.map((t, i) => (
                <span key={i}>
                  {t.topic} · {percent(t.accuracy)}
                </span>
              ))}
            </div>
          )}
          {resource.data?.items.length ? (
            <div className="recommendation-list">
              {resource.data.items.map((b) => (
                <article key={b.id}>
                  <span className="exam-icon">
                    <BookOpen size={24} />
                  </span>
                  <div className="grow">
                    <h3>{b.title || b.name}</h3>
                    <p>{b.matchedTopics.join(' · ')}</p>
                    <small>
                      {b.question_count || b.libraryStats?.questionCount || 0} questions in
                      collection
                    </small>
                  </div>
                  <Button
                    onClick={() => onPractice({ bundleId: b.id, topic: b.searchTopic || '' })}
                  >
                    Choose questions <ArrowRight size={15} />
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={
                resource.data?.topics.length ? 'No matching collections' : 'No recommendations yet'
              }
              text={
                resource.data?.topics.length
                  ? 'There are no collection-level matches. Search individual questions in the library.'
                  : 'Once graded responses reveal a topic gap, relevant library collections appear here.'
              }
              action={
                <Button onClick={() => onPractice({})}>
                  Explore the library <ArrowRight size={15} />
                </Button>
              }
            />
          )}
        </>
      )}
    </section>
  );
}
function AttemptInspector({ id, onClose, onSaved }) {
  const resource = useResource(`/teacher/attempts/${id}`),
    [scores, setScores] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const a = resource.data;
  return (
    <Modal
      wide
      title="Attempt answers"
      subtitle={
        a
          ? `Attempt ${a.number} · ${when(a.startedAt)} · ${a.status === 'submitted' ? percent(a.result.percent) : 'In progress'}`
          : ''
      }
      onClose={onClose}
    >
      <ErrorBox error={error || resource.error} />
      {resource.loading ? (
        <Loading />
      ) : (
        a && (
          <>
            {a.questions.map((q, i) => {
              const answer = a.answers[q.key];
              return (
                <article className="detail-question" key={q.key}>
                  <div className="question-tags">
                    <strong>QUESTION {i + 1}</strong>
                    <span>{q.topic}</span>
                    <span>{q.marks} marks</span>
                  </div>
                  <SourceContent question={q} assets={a.assets} />
                  {q.type === 'theory' ? (
                    <>
                      <div className="written-response">
                        <strong>Student response</strong>
                        <p>{answer || 'No response submitted.'}</p>
                      </div>
                      <div className="explanation">
                        <strong>Marking guide</strong>
                        <RichContent
                          text={q.answerText || q.explanation || 'No source answer supplied.'}
                          html={q.answerHtml || q.explanationHtml}
                          assets={a.assets}
                        />
                      </div>
                      {a.status === 'submitted' && (
                        <label className="grade-input">
                          Awarded marks
                          <input
                            type="number"
                            min={0}
                            max={q.marks}
                            value={scores[q.key] ?? a.manual[q.key] ?? ''}
                            placeholder={`0–${q.marks}`}
                            onChange={(e) =>
                              setScores((s) => ({
                                ...s,
                                [q.key]: e.target.value === '' ? undefined : Number(e.target.value),
                              }))
                            }
                          />
                          <small>of {q.marks}</small>
                        </label>
                      )}
                    </>
                  ) : (
                    <ol className="preview-options">
                      {q.options.map((o, n) => (
                        <li
                          className={q.correct === n ? 'correct' : answer === n ? 'incorrect' : ''}
                          key={n}
                        >
                          <b>{String.fromCharCode(65 + n)}</b>
                          <RichContent text={o} html={q.optionsHtml?.[n]} assets={a.assets} />
                          {answer === n && <small>Student chose</small>}
                          {q.correct === n && <Check size={15} />}
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              );
            })}
            <div className="modal-actions">
              <Button
                icon={Download}
                onClick={() =>
                  exportCsv(
                    a.questions.map((q) => {
                      const outcome = a.result?.outcomes.find((o) => o.key === q.key);
                      return {
                        question: q.question,
                        topic: q.topic,
                        response: a.answers[q.key] ?? '',
                        score: outcome?.score ?? '',
                        possible: q.marks,
                      };
                    }),
                    'attempt-answers',
                  )
                }
              >
                Export answers
              </Button>
              <Button
                variant="primary"
                disabled={busy || !Object.keys(scores).some((k) => scores[k] !== undefined)}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(`/teacher/attempts/${id}/grade`, {
                      method: 'PUT',
                      body: {
                        scores: Object.fromEntries(
                          Object.entries(scores).filter(([, v]) => v !== undefined),
                        ),
                      },
                    });
                    onSaved();
                    onClose();
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Saving marks…' : 'Save written marks'}
              </Button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}
function ExamPreview({ exam, onClose }) {
  const [index, setIndex] = useState(0),
    [selected, setSelected] = useState(null);
  const q = exam.questions[index];
  return (
    <Modal
      wide
      title="Student preview"
      subtitle="Preview only. This does not record an attempt or change your results."
      onClose={onClose}
    >
      {q ? (
        <>
          <div className="preview-top">
            <Badge status="draft">Teacher preview</Badge>
            <span>
              Question {index + 1} of {exam.questions.length}
            </span>
            <span>
              <Clock3 size={14} />
              {exam.settings.durationMinutes} min
            </span>
          </div>
          <h3>
            {q.subject} · {q.topic}
          </h3>
          <SourceContent question={q} assets={exam.assets} />
          {q.type === 'theory' ? (
            <textarea
              className="preview-written"
              aria-label="Preview written response"
              placeholder="Your response goes here…"
            />
          ) : (
            <div className="preview-choice-list">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  aria-pressed={selected === i}
                  className={selected === i ? 'selected' : ''}
                  onClick={() => setSelected(i)}
                >
                  <b>{String.fromCharCode(65 + i)}</b>
                  <RichContent text={o} html={q.optionsHtml?.[i]} assets={exam.assets} />
                  {selected === i && <Check size={16} />}
                </button>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <Button
              disabled={index === 0}
              onClick={() => {
                setIndex((i) => i - 1);
                setSelected(null);
              }}
            >
              Previous
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (index === exam.questions.length - 1) onClose();
                else {
                  setIndex((i) => i + 1);
                  setSelected(null);
                }
              }}
            >
              {index === exam.questions.length - 1 ? 'Finish preview' : 'Next question'}
              <ArrowRight size={16} />
            </Button>
          </div>
        </>
      ) : (
        <Empty title="Add a question to see your exam preview." />
      )}
    </Modal>
  );
}
