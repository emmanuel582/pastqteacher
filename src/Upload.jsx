import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { request, useResource, isDemo } from './data';
import { Heading } from './components';
import { Badge, Button, Empty, ErrorBox, Loading, Modal, when } from './components';
export default function UploadPage({ go, notify, version }) {
  const list = useResource('/teacher/uploads', version),
    [files, setFiles] = useState([]),
    [name, setName] = useState(''),
    [subject, setSubject] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [sourceId, setSourceId] = useState(null),
    [drag, setDrag] = useState(false);
  const input = useRef(),
    uploadId = useRef(null),
    uploaded = useRef(0),
    active = useRef(true),
    lock = useRef(false);
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  function choose(incoming) {
    if (lock.current) return;
    setError('');
    uploadId.current = null;
    uploaded.current = 0;
    setFiles((current) => [...current, ...incoming]);
  }
  async function start() {
    if (lock.current || !files.length) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (isDemo)
        throw new Error(
          'Document extraction uses the real PastQ engine. Sign in with your account to upload a paper.',
        );
      const pdf = files.some((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (pdf && files.length !== 1) throw new Error('Choose one PDF, or a set of page images.');
      if (files.some((f) => f.size === 0 || f.size > 25 * 1024 * 1024))
        throw new Error('Each file must contain data and be smaller than 25 MB.');
      if (files.length > 80) throw new Error('Use up to 80 page images per upload.');
      if (files.some((f) => !/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name)))
        throw new Error('Choose a PDF, JPEG, PNG, WebP, or HEIC page image.');
      setProgress('Preparing your paper…');
      if (!uploadId.current) {
        const source = await request('/teacher/uploads', {
          method: 'POST',
          body: { name: name || files[0].name.replace(/\.[^.]+$/, ''), subject },
        });
        uploadId.current = source.id;
      }
      for (let i = uploaded.current; i < files.length; i += 8) {
        setProgress(
          `Uploading ${pdf ? 'PDF' : `pages ${i + 1}–${Math.min(i + 8, files.length)} of ${files.length}`}…`,
        );
        const body = new FormData();
        for (const f of files.slice(i, i + 8)) body.append('files', f);
        await request(`/teacher/uploads/${uploadId.current}/files`, { method: 'POST', body });
        uploaded.current = Math.min(i + 8, files.length);
      }
      if (!pdf) await request(`/teacher/uploads/${uploadId.current}/start`, { method: 'POST' });
      if (active.current) {
        setSourceId(uploadId.current);
        setFiles([]);
        setName('');
        uploadId.current = null;
        uploaded.current = 0;
        notify('Paper uploaded. Questions are being extracted.');
      }
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      lock.current = false;
      if (active.current) {
        setBusy(false);
        setProgress('');
      }
    }
  }
  return (
    <>
      <Heading
        eyebrow="QUESTION EXTRACTION"
        title="Upload a question paper"
        text="Upload a PDF or page photos. PastQ turns them into questions you can review and set as an exam."
      />
      <div className="upload-grid">
        <section
          className={`panel upload-drop ${drag ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            choose(Array.from(e.dataTransfer.files));
          }}
        >
          <div className="upload-art">
            <div className="paper-sheet">
              <i />
              <i />
              <i />
              <span>
                <Check size={18} />
              </span>
            </div>
            <span className="paper-clip" />
          </div>
          <h2>PDF or page photos</h2>
          <p>Drop your PDF or page photos here.</p>
          <Button
            variant="primary"
            icon={Plus}
            disabled={busy}
            onClick={() => input.current.click()}
          >
            Choose files
          </Button>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            onChange={(e) => {
              choose(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <small>PDF, JPG, PNG, WebP, HEIC · up to 25 MB per file</small>
          {files.length > 0 && (
            <div className="upload-files">
              {files.map((f, index) => (
                <div key={`${f.name}-${index}`}>
                  <FileText size={18} />
                  <span>
                    {f.name}
                    <small>{(f.size / 1024 / 1024).toFixed(1)} MB</small>
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${f.name}`}
                    disabled={busy}
                    onClick={() => {
                      setFiles(files.filter((_, i) => i !== index));
                      uploadId.current = null;
                      uploaded.current = 0;
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel padded upload-details">
          <span className="eyebrow">UPLOAD DETAILS</span>
          <h2>Paper details</h2>
          <div className="form-stack">
            <label>
              Paper name
              <input
                maxLength={160}
                disabled={busy}
                placeholder="e.g. Chemistry revision · Paper 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Subject hint <small>Optional</small>
              <input
                maxLength={200}
                disabled={busy}
                placeholder="e.g. Chemistry"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <div className="upload-process">
              <div>
                <span>1</span>
                <p>
                  <strong>Upload your paper.</strong> Keep page photos clear and in order.
                </p>
              </div>
              <div>
                <span>2</span>
                <p>
                  <strong>Let PastQ read it.</strong> Questions, options, figures, and source
                  answers.
                </p>
              </div>
              <div>
                <span>3</span>
                <p>
                  <strong>Make it exam-ready.</strong> Review the extraction, then choose your
                  settings.
                </p>
              </div>
            </div>
            <p className="field-note">
              <LockIcon />
              Teacher papers stay private. Publishing an exam never adds the paper to the shared
              library.
            </p>
            <ErrorBox error={error} />
            <Button
              variant="primary"
              disabled={busy || !files.length}
              icon={Upload}
              onClick={start}
            >
              {busy ? progress : 'Upload & extract questions'}
            </Button>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PAPERS IN YOUR WORKSPACE</span>
            <h2>Your uploads</h2>
          </div>
          <span className="muted">{list.data?.items.length || 0} papers</span>
        </div>
        <ErrorBox error={list.error} />
        {list.loading ? (
          <Loading />
        ) : list.data?.items.length ? (
          list.data.items.map((source) => (
            <button className="exam-row" key={source.id} onClick={() => setSourceId(source.id)}>
              <span className="exam-icon">
                <FileText size={22} />
              </span>
              <span className="grow">
                <strong>{source.name}</strong>
                <small>{when(source.createdAt)}</small>
              </span>
              <span className="text-btn">
                Open extraction <ArrowRight size={15} />
              </span>
            </button>
          ))
        ) : (
          <Empty
            title="No uploads yet"
            text="Your uploaded papers and extraction progress will appear here."
          />
        )}
      </section>
      {sourceId && (
        <SourceProgress id={sourceId} onClose={() => setSourceId(null)} go={go} notify={notify} />
      )}
    </>
  );
}
function LockIcon() {
  return <span aria-hidden="true">↳</span>;
}
function SourceProgress({ id, onClose, go, notify }) {
  const [tick, setTick] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [examId, setExamId] = useState('');
  const source = useResource(`/teacher/uploads/${id}`, tick),
    exams = useResource('/teacher/exams');
  useEffect(() => {
    if (['completed', 'completed_with_errors'].includes(source.data?.status)) return;
    const timer = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, [source.data?.status]);
  const s = source.data,
    ready = ['completed', 'completed_with_errors'].includes(s?.status);
  async function add() {
    setBusy(true);
    try {
      const exam = examId
        ? await request(`/teacher/exams/${examId}`)
        : await request('/teacher/exams', {
            method: 'POST',
            body: {
              title: s.name,
              visibility: 'private',
              priceMinor: 0,
              currency: 'NGN',
              questions: [],
            },
          });
      await request(`/teacher/exams/${exam.id}/import-upload`, {
        method: 'POST',
        body: { sourceId: id, revision: exam.revision },
      });
      notify('Your questions are ready to review.');
      onClose();
      go(`exams/${exam.id}/edit`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={s?.name || 'Preparing your paper'}
      subtitle="Your original paper stays in your private workspace."
      onClose={onClose}
    >
      <ErrorBox error={error || source.error} />
      {source.loading ? (
        <Loading />
      ) : (
        s && (
          <>
            <div className="extraction-state">
              <Badge status={ready ? 'open' : 'draft'}>{s.status.replaceAll('_', ' ')}</Badge>
              <h3>
                {ready
                  ? `${s.questions?.length || 0} questions ready to review`
                  : 'Extracting questions'}
              </h3>
              <p>
                {s.progress?.done || 0} of {s.progress?.total || 0} pages read
              </p>
              <progress
                value={(s.progress?.done || 0) + (s.progress?.skipped || 0)}
                max={s.progress?.total || 1}
              />
            </div>
            {s.followUps
              ?.filter((f) => f.status === 'open')
              .map((f) => (
                <div className="extraction-followup" key={f.id}>
                  {f.message}
                </div>
              ))}
            {!ready && ['paused', 'failed', 'needs_attention'].includes(s.status) && (
              <Button
                icon={RefreshCw}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(`/teacher/uploads/${id}/resume`, { method: 'POST' });
                    setTick((t) => t + 1);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Retry extraction
              </Button>
            )}
            {ready && s.questions?.length > 0 && (
              <div className="form-stack">
                <label>
                  Add questions to
                  <select value={examId} onChange={(e) => setExamId(e.target.value)}>
                    <option value="">A new private exam draft</option>
                    {exams.data?.items
                      .filter((e) => e.status === 'draft')
                      .map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.title}
                        </option>
                      ))}
                  </select>
                </label>
                <Button variant="primary" icon={ArrowRight} disabled={busy} onClick={add}>
                  {busy ? 'Adding questions…' : 'Review in exam builder'}
                </Button>
              </div>
            )}
          </>
        )
      )}
    </Modal>
  );
}
