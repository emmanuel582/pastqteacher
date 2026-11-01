import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Files,
  Globe2,
  ImagePlus,
  Library,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { request, useResource } from './data';
import { Heading } from './components';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  SourceContent,
  RichContent,
  Steps,
  money,
  when,
} from './components';
import { mediaUrl } from './api';
import { LibraryPicker } from './Library';
const initialSettings = () => ({
  durationMinutes: 30,
  maxAttempts: 1,
  passMark: 50,
  negativeMark: 0,
  shuffleQuestions: true,
  shuffleOptions: false,
  resultRelease: 'immediate',
  showSolutions: false,
  startsAt: null,
  endsAt: null,
  capacity: 0,
  instructions: '',
});
const newExam = () => ({
  title: '',
  description: '',
  subject: '',
  visibility: 'private',
  priceMinor: 0,
  currency: 'NGN',
  logo: null,
  questions: [],
  settings: initialSettings(),
});
const blankQuestion = () => ({
  key: crypto.randomUUID(),
  type: 'mcq',
  subject: '',
  topic: '',
  question: '',
  options: ['', '', '', ''],
  correct: null,
  explanation: '',
  marks: 1,
});
const localDate = (value) =>
  value
    ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
export default function Builder({ id, go, notify, profile }) {
  const resource = useResource(id ? `/teacher/exams/${id}` : null),
    [form, setForm] = useState(newExam),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(null),
    [picker, setPicker] = useState(false),
    [uploads, setUploads] = useState(false),
    [preview, setPreview] = useState(null),
    [saved, setSaved] = useState(false);
  const [paidEntry, setPaidEntry] = useState(false);
  const currentId = useRef(id),
    dirty = useRef(false),
    operation = useRef(false);
  useEffect(() => {
    if (resource.data) {
      setForm(resource.data);
      setPaidEntry(resource.data.priceMinor > 0);
      currentId.current = resource.data.id;
    }
  }, [resource.data]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function update(changes) {
    dirty.current = true;
    setSaved(false);
    setForm((f) => ({ ...f, ...changes }));
  }
  function setting(key, value) {
    update({ settings: { ...form.settings, [key]: value } });
  }
  async function persist() {
    if (!form.title.trim()) {
      setStep(0);
      throw new Error('Give your exam a name before saving.');
    }
    if (paidEntry && form.priceMinor <= 0) {
      setStep(0);
      throw new Error('Enter a price for this paid exam.');
    }
    const { assets, ...draft } = form;
    const result = await request(
      currentId.current ? `/teacher/exams/${currentId.current}` : '/teacher/exams',
      { method: currentId.current ? 'PUT' : 'POST', body: draft },
    );
    currentId.current = result.id;
    setForm(result);
    dirty.current = false;
    setSaved(true);
    return result;
  }
  async function save(publish = false) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const draft = await persist();
      if (publish) {
        await request(`/teacher/exams/${draft.id}/publish`, { method: 'POST' });
        notify('Your exam is published.');
        go(`exams/${draft.id}`);
      } else notify('Exam draft saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function importQuestions(bundleId, indexes) {
    setBusy(true);
    setError('');
    try {
      const draft = await persist();
      const result = await request(`/teacher/exams/${draft.id}/import-library`, {
        method: 'POST',
        body: { bundleId, indexes, revision: draft.revision },
      });
      setForm(result);
      setPicker(false);
      setSaved(true);
      notify(`${indexes.length} questions added to your draft.`);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function importUpload(sourceId) {
    setBusy(true);
    setError('');
    try {
      const draft = await persist();
      const result = await request(`/teacher/exams/${draft.id}/import-upload`, {
        method: 'POST',
        body: { sourceId, revision: draft.revision },
      });
      setForm(result);
      setUploads(false);
      setSaved(true);
      notify('Extracted questions added. Check the answer keys before publishing.');
    } catch (e) {
      setError(e.message);
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (id && resource.loading) return <Loading />;
  if (resource.error) return <ErrorBox error={resource.error} />;
  if (form.status && form.status !== 'draft')
    return (
      <Empty
        title="This exam has been published."
        text="Published content is locked to keep scores consistent. Duplicate the exam to make a new version."
        action={<Button onClick={() => go(`exams/${id}`)}>View exam</Button>}
      />
    );
  const totalMarks = form.questions.reduce((n, q) => n + Number(q.marks || 1), 0),
    missing = form.questions.filter((q) => q.type !== 'theory' && q.correct === null).length;
  return (
    <div className="builder">
      <button
        className="back-link"
        onClick={() => {
          if (!dirty.current || window.confirm('Leave this exam without saving your changes?'))
            go('exams');
        }}
      >
        <ArrowLeft size={15} />
        Back to exams
      </button>
      <Heading
        eyebrow="EXAM BUILDER"
        title={id || currentId.current ? 'Edit exam' : 'Create exam'}
        text="Add details, review questions, and choose exam settings."
        action={
          <Button icon={Save} disabled={busy} onClick={() => save()}>
            {saved ? 'Draft saved' : 'Save draft'}
          </Button>
        }
      />
      <Steps current={step} onStep={setStep} />
      <ErrorBox error={error} />
      <div className="builder-grid">
        <section className="panel builder-main">
          {step === 0 ? (
            <>
              <div className="section-heading">
                <span className="eyebrow">01 / THE FIRST IMPRESSION</span>
                <h2>Exam details</h2>
                <p>Set the name, branding, access, and entry price.</p>
              </div>
              <div className="form-stack">
                <label>
                  Exam name <span className="required">*</span>
                  <input
                    placeholder="e.g. Chemistry · The stoichiometry check-in"
                    maxLength={160}
                    required
                    value={form.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={3}
                    maxLength={3000}
                    placeholder="What will students practise in this exam?"
                    value={form.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </label>
                <label>
                  Subject
                  <input
                    maxLength={200}
                    placeholder="e.g. Chemistry"
                    value={form.subject}
                    onChange={(e) => update({ subject: e.target.value })}
                  />
                </label>
                <label>
                  Exam logo <small>Optional · your workspace logo is the fallback</small>
                  <div className="logo-upload">
                    {form.logo || profile.logo ? (
                      <img src={mediaUrl(form.logo || profile.logo)} alt="Exam branding" />
                    ) : (
                      <ImagePlus size={28} />
                    )}
                    <input
                      type="file"
                      aria-label="Upload exam logo"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        setBusy(true);
                        try {
                          const body = new FormData();
                          body.append('logo', file);
                          const result = await request('/teacher/logo', { method: 'POST', body });
                          update({ logo: result.logo });
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </div>
                </label>
                <div className="form-separator" />
                <label>Who can join?</label>
                <div className="choice-grid">
                  {[
                    [
                      'private',
                      LockKeyhole,
                      'Invite only',
                      'Only students with your private code can enter.',
                    ],
                    [
                      'public',
                      Globe2,
                      'Open to discovery',
                      'Students can find your exam in public listings.',
                    ],
                  ].map(([value, Icon, title, copy]) => (
                    <button
                      type="button"
                      aria-pressed={form.visibility === value}
                      className={`choice ${form.visibility === value ? 'selected' : ''}`}
                      key={value}
                      onClick={() => update({ visibility: value })}
                    >
                      <Icon size={23} strokeWidth={1.5} />
                      <strong>{title}</strong>
                      <span>{copy}</span>
                      <i>{form.visibility === value && <Check size={12} />}</i>
                    </button>
                  ))}
                </div>
                <div className="form-row">
                  <label>
                    Entry
                    <select
                      value={paidEntry ? 'paid' : 'free'}
                      onChange={(e) => {
                        setPaidEntry(e.target.value === 'paid');
                        update({
                          priceMinor:
                            e.target.value === 'free' ? 0 : form.currency === 'NGN' ? 100000 : 500,
                          settings: { ...form.settings, capacity: 0 },
                        });
                      }}
                    >
                      <option value="free">Free for students</option>
                      <option value="paid">Paid exam · Bachs checkout</option>
                    </select>
                  </label>
                  {paidEntry && (
                    <>
                      <label>
                        Currency
                        <select
                          value={form.currency}
                          onChange={(e) => update({ currency: e.target.value })}
                        >
                          <option>NGN</option>
                          <option>USD</option>
                        </select>
                      </label>
                      <label>
                        Entry price
                        <input
                          type="number"
                          min={form.currency === 'NGN' ? 100 : 1}
                          step="0.01"
                          value={form.priceMinor / 100}
                          onChange={(e) =>
                            update({ priceMinor: Math.round(Number(e.target.value) * 100) })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
                {paidEntry && (
                  <p className="field-note">
                    <ShieldCheck size={16} /> Students get access after Bachs verifies their
                    payment. Connect your account in Workspace settings before publishing.
                  </p>
                )}
              </div>
            </>
          ) : step === 1 ? (
            <>
              <div className="section-heading">
                <span className="eyebrow">02 / QUESTIONS</span>
                <h2>Exam questions</h2>
                <p>Add questions from an upload, the library, or manual entry.</p>
              </div>
              <div className="question-sources">
                <button onClick={() => setUploads(true)}>
                  <Upload size={23} />
                  <strong>From an upload</strong>
                  <span>Your extracted papers</span>
                </button>
                <button onClick={() => setPicker(true)}>
                  <Library size={23} />
                  <strong>From the library</strong>
                  <span>PastQ question collections</span>
                </button>
                <button
                  onClick={() =>
                    setEditing({
                      question: { ...blankQuestion(), subject: form.subject },
                      index: null,
                    })
                  }
                >
                  <Plus size={23} />
                  <strong>Write a question</strong>
                  <span>MCQ or written response</span>
                </button>
              </div>
              {missing > 0 && (
                <p className="review-warning">
                  {missing} question{missing === 1 ? ' needs' : 's need'} an answer key. Check these
                  before publishing.
                </p>
              )}
              <div className="question-list">
                {form.questions.map((q, i) => (
                  <article className="question-list-item" key={q.key}>
                    <div className="question-list-number">{String(i + 1).padStart(2, '0')}</div>
                    <div className="grow">
                      <div className="question-tags">
                        <span>{q.subject || 'General'}</span>
                        <span>{q.topic || 'Unsectioned'}</span>
                        <span>
                          {q.type === 'theory' ? 'Written' : 'MCQ'} · {q.marks}{' '}
                          {q.marks === 1 ? 'mark' : 'marks'}
                        </span>
                      </div>
                      <button className="question-title" onClick={() => setPreview(q)}>
                        {q.question}
                      </button>
                      <small
                        className={
                          q.type !== 'theory' && q.correct === null ? 'warning-text' : 'answer-key'
                        }
                      >
                        {q.type === 'theory'
                          ? 'Teacher graded after submission'
                          : q.correct === null
                            ? 'Answer key needed'
                            : `Answer: ${String.fromCharCode(65 + q.correct)} · ${q.options[q.correct]}`}
                      </small>
                    </div>
                    <div className="question-actions">
                      <button
                        className="text-btn"
                        onClick={() => setEditing({ question: structuredClone(q), index: i })}
                      >
                        Edit
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Remove question ${i + 1}`}
                        onClick={() =>
                          update({ questions: form.questions.filter((_, n) => n !== i) })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!form.questions.length && (
                <Empty
                  title="No questions added"
                  text="Choose where your first questions will come from."
                />
              )}
            </>
          ) : step === 2 ? (
            <>
              <div className="section-heading">
                <span className="eyebrow">03 / MAKE THE EXAM WORK FOR YOU</span>
                <h2>Exam settings</h2>
                <p>Set time limits, attempts, marking rules, and result release.</p>
              </div>
              <div className="form-stack">
                <div className="form-row">
                  <label>
                    Time allowed <small>Minutes</small>
                    <input
                      type="number"
                      min={1}
                      max={360}
                      value={form.settings.durationMinutes}
                      onChange={(e) => setting('durationMinutes', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Attempts per student
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.settings.maxAttempts}
                      onChange={(e) => setting('maxAttempts', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Pass mark <small>Percent</small>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.settings.passMark}
                      onChange={(e) => setting('passMark', Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Opens at <small>Optional · your device time zone</small>
                    <input
                      type="datetime-local"
                      value={localDate(form.settings.startsAt)}
                      onChange={(e) =>
                        setting(
                          'startsAt',
                          e.target.value ? new Date(e.target.value).toISOString() : null,
                        )
                      }
                    />
                  </label>
                  <label>
                    Closes at <small>Optional · ends active attempts</small>
                    <input
                      type="datetime-local"
                      value={localDate(form.settings.endsAt)}
                      onChange={(e) =>
                        setting(
                          'endsAt',
                          e.target.value ? new Date(e.target.value).toISOString() : null,
                        )
                      }
                    />
                  </label>
                </div>
                <div className="form-separator" />
                <h3>Marking & results</h3>
                <div className="form-row">
                  <label>
                    Wrong-answer penalty
                    <select
                      value={form.settings.negativeMark}
                      onChange={(e) => setting('negativeMark', Number(e.target.value))}
                    >
                      <option value={0}>No penalty</option>
                      <option value={0.25}>25% of question marks</option>
                      <option value={0.5}>50% of question marks</option>
                      <option value={1}>Full question marks</option>
                    </select>
                  </label>
                  <label>
                    Release results
                    <select
                      value={form.settings.resultRelease}
                      onChange={(e) => setting('resultRelease', e.target.value)}
                    >
                      <option value="immediate">After submission and grading</option>
                      <option value="after_close">After the exam closes</option>
                      <option value="manual">When I release them</option>
                    </select>
                  </label>
                </div>
                <Switch
                  title="Show solutions with released results"
                  copy="Students can review the correct choices and your explanations."
                  checked={form.settings.showSolutions}
                  onChange={(v) => setting('showSolutions', v)}
                />
                <Switch
                  title="Shuffle question order"
                  copy="A different order for every attempt."
                  checked={form.settings.shuffleQuestions}
                  onChange={(v) => setting('shuffleQuestions', v)}
                />
                <Switch
                  title="Shuffle answer options"
                  copy="The correct answer stays attached when choices move."
                  checked={form.settings.shuffleOptions}
                  onChange={(v) => setting('shuffleOptions', v)}
                />
                <div className="form-separator" />
                <label>
                  Student instructions
                  <textarea
                    rows={4}
                    maxLength={5000}
                    placeholder="Anything students should know before they begin."
                    value={form.settings.instructions}
                    onChange={(e) => setting('instructions', e.target.value)}
                  />
                </label>
                {form.priceMinor === 0 && (
                  <label>
                    Enrollment limit <small>0 means no limit</small>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={form.settings.capacity}
                      onChange={(e) => setting('capacity', Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="section-heading">
                <span className="eyebrow">04 / ONE LAST LOOK</span>
                <h2>Review & publish</h2>
                <p>Check every detail. Published content is locked to keep results consistent.</p>
              </div>
              <div className="exam-preview">
                <div className="exam-icon">
                  {form.logo || profile.logo ? (
                    <img src={mediaUrl(form.logo || profile.logo)} alt="" />
                  ) : (
                    <Files size={28} />
                  )}
                </div>
                <small>{profile.organization || profile.name}</small>
                <h2>{form.title || 'Your untitled exam'}</h2>
                <p>{form.description}</p>
                <div className="preview-chips">
                  <Badge status={form.visibility} />
                  <span>
                    {form.priceMinor ? money(form.priceMinor, form.currency) : 'Free entry'}
                  </span>
                  <span>{form.questions.length} questions</span>
                  <span>{form.settings.durationMinutes} min</span>
                </div>
              </div>
              <div className="review-details">
                <div>
                  <span>Opening time</span>
                  <strong>{when(form.settings.startsAt)}</strong>
                </div>
                <div>
                  <span>Closing time</span>
                  <strong>{when(form.settings.endsAt)}</strong>
                </div>
                <div>
                  <span>Total marks</span>
                  <strong>{totalMarks}</strong>
                </div>
                <div>
                  <span>Attempts per student</span>
                  <strong>{form.settings.maxAttempts}</strong>
                </div>
                <div>
                  <span>Result release</span>
                  <strong>
                    {
                      {
                        immediate: 'After submission & grading',
                        after_close: 'When exam closes',
                        manual: 'Released by you',
                      }[form.settings.resultRelease]
                    }
                  </strong>
                </div>
              </div>
              {missing > 0 && (
                <p className="review-warning">
                  Add the {missing} missing answer {missing === 1 ? 'key' : 'keys'} in Questions
                  before publishing.
                </p>
              )}
              <div className="field-note">
                <ShieldCheck size={19} />
                <span>
                  {form.visibility === 'private'
                    ? 'A private invite code will be generated when you publish. Only students who receive it can join.'
                    : 'This exam will appear in the teacher exam discovery API when you publish.'}
                </span>
              </div>
            </>
          )}
          <div className="builder-footer">
            <Button
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => s - 1)}
              icon={ArrowLeft}
            >
              Back
            </Button>
            <Button className="mobile-save" disabled={busy} onClick={() => save()}>
              Save
            </Button>
            {step < 3 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={Globe2}
                disabled={busy || !form.questions.length || missing > 0}
                onClick={() => save(true)}
              >
                {busy ? 'Publishing…' : 'Publish exam'}
              </Button>
            )}
          </div>
        </section>
        <aside className="builder-aside">
          <section className="panel padded">
            <span className="eyebrow">YOUR EXAM AT A GLANCE</span>
            <h3>{form.title || 'Untitled exam'}</h3>
            <dl>
              <div>
                <dt>Questions</dt>
                <dd>{form.questions.length}</dd>
              </div>
              <div>
                <dt>Total marks</dt>
                <dd>{totalMarks}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{form.settings.durationMinutes} min</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{form.visibility === 'private' ? 'Invite only' : 'Public'}</dd>
              </div>
              <div>
                <dt>Entry</dt>
                <dd>{form.priceMinor ? money(form.priceMinor, form.currency) : 'Free'}</dd>
              </div>
            </dl>
            <span className="draft-note">
              <span className={`status-dot ${saved ? 'green' : ''}`} />
              {saved ? 'Saved to your workspace' : 'Save your draft to keep your work'}
            </span>
          </section>
          <div className="builder-tip">
            <span>✳</span>
            <strong>Topic labels</strong>
            <p>Add a topic to each question so results can show which areas need more practice.</p>
          </div>
        </aside>
      </div>
      {editing && (
        <QuestionEditor
          value={editing.question}
          assets={form.assets}
          onClose={() => setEditing(null)}
          onSave={(q) => {
            const questions = [...form.questions];
            if (editing.index === null) questions.push(q);
            else questions[editing.index] = q;
            update({ questions });
            setEditing(null);
          }}
        />
      )}{' '}
      {picker && (
        <LibraryPicker onClose={() => setPicker(false)} onImport={importQuestions} busy={busy} />
      )}{' '}
      {uploads && (
        <UploadPicker onClose={() => setUploads(false)} onImport={importUpload} busy={busy} />
      )}{' '}
      {preview && (
        <Modal title="Question preview" onClose={() => setPreview(null)}>
          <SourceContent question={preview} assets={form.assets} />
          <ol className="preview-options">
            {preview.options.map((o, i) => (
              <li key={i} className={preview.correct === i ? 'correct' : ''}>
                <b>{String.fromCharCode(65 + i)}</b>
                <RichContent text={o} html={preview.optionsHtml?.[i]} assets={form.assets} />
              </li>
            ))}
          </ol>
          {preview.explanation && <p className="explanation">{preview.explanation}</p>}
        </Modal>
      )}
    </div>
  );
}
function Switch({ title, copy, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
function QuestionEditor({ value, assets, onClose, onSave }) {
  const [q, setQ] = useState(value),
    [error, setError] = useState('');
  function update(changes) {
    setQ((q) => ({ ...q, ...changes }));
  }
  return (
    <Modal
      wide
      title="Edit question"
      subtitle="Check the wording, topic, and answer before adding it to your exam."
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.question.trim() || (q.type !== 'theory' && q.options.some((o) => !o.trim()))) {
            setError('Fill in the question and every answer option.');
            return;
          }
          onSave(q);
        }}
      >
        <div className="form-row">
          <label>
            Question type
            <select
              value={q.type}
              onChange={(e) =>
                update({
                  type: e.target.value,
                  options: e.target.value === 'theory' ? [] : ['', '', '', ''],
                  correct: null,
                })
              }
            >
              <option value="mcq">Multiple choice</option>
              <option value="theory">Written response</option>
            </select>
          </label>
          <label>
            Marks
            <input
              type="number"
              min={1}
              max={100}
              value={q.marks}
              onChange={(e) => update({ marks: Number(e.target.value) })}
            />
          </label>
        </div>
        <label>
          Question
          <textarea
            required
            rows={4}
            value={q.question}
            onChange={(e) => update({ question: e.target.value, questionHtml: undefined })}
          />
        </label>
        {q.questionHtml && (
          <div className="source-preview">
            <span>Original formatting</span>
            <SourceContent question={q} assets={assets} />
          </div>
        )}
        <div className="form-row">
          <label>
            Subject
            <input
              required
              maxLength={200}
              value={q.subject}
              onChange={(e) => update({ subject: e.target.value })}
            />
          </label>
          <label>
            Topic
            <input
              maxLength={200}
              placeholder="e.g. Stoichiometry"
              value={q.topic}
              onChange={(e) => update({ topic: e.target.value })}
            />
          </label>
        </div>
        {q.type !== 'theory' ? (
          <fieldset className="options-editor">
            <legend>
              Answer options <small>Select the correct answer</small>
            </legend>
            {q.options.map((option, index) => (
              <div className="option-editor" key={index}>
                <input
                  type="radio"
                  aria-label={`Mark option ${String.fromCharCode(65 + index)} correct`}
                  name="correct-answer"
                  checked={q.correct === index}
                  onChange={() => update({ correct: index })}
                />
                <span>{String.fromCharCode(65 + index)}</span>
                <input
                  required
                  aria-label={`Option ${String.fromCharCode(65 + index)}`}
                  value={option}
                  onChange={(e) =>
                    update({
                      options: q.options.map((v, i) => (i === index ? e.target.value : v)),
                      optionsHtml: undefined,
                    })
                  }
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() =>
                      update({
                        options: q.options.filter((_, i) => i !== index),
                        optionsHtml: undefined,
                        correct:
                          q.correct === index
                            ? null
                            : q.correct > index
                              ? q.correct - 1
                              : q.correct,
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <Button
              type="button"
              icon={Plus}
              disabled={q.options.length >= 12}
              onClick={() => update({ options: [...q.options, ''], optionsHtml: undefined })}
            >
              Add option
            </Button>
          </fieldset>
        ) : (
          <label>
            Model answer / marking guide
            <textarea
              rows={4}
              value={q.answerText || ''}
              onChange={(e) => update({ answerText: e.target.value, answerHtml: undefined })}
            />
          </label>
        )}
        <label>
          Explanation <small>Shown only when solutions are released</small>
          <textarea
            rows={3}
            value={q.explanation || ''}
            onChange={(e) => update({ explanation: e.target.value, explanationHtml: undefined })}
          />
        </label>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check}>
            Save question
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function UploadPicker({ onClose, onImport, busy }) {
  const list = useResource('/teacher/uploads');
  return (
    <Modal
      title="Your uploaded papers"
      subtitle="Choose a completed extraction to add its questions."
      onClose={onClose}
    >
      <ErrorBox error={list.error} />
      {list.loading ? (
        <Loading />
      ) : list.data?.items.length ? (
        list.data.items.map((source) => (
          <div className="source-picker-row" key={source.id}>
            <Files size={24} />
            <span>
              <strong>{source.name}</strong>
              <small>{when(source.createdAt)}</small>
            </span>
            <Button disabled={busy} onClick={() => onImport(source.id)}>
              Import <ArrowRight size={15} />
            </Button>
          </div>
        ))
      ) : (
        <Empty
          title="No uploaded papers yet."
          text="Open Uploads to turn your first paper into questions."
        />
      )}
    </Modal>
  );
}
