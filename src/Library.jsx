import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Library, Plus, Search } from 'lucide-react';
import { request, useResource } from './data';
import { Heading } from './components';
import { Button, Empty, ErrorBox, Loading, Modal, SourceContent } from './components';
export default function QuestionLibrary({ go, notify, exams }) {
  const [picker, setPicker] = useState(false),
    [initialBundleId, setInitialBundleId] = useState(null),
    [examId, setExamId] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const drafts = exams.filter((e) => e.status === 'draft');
  async function add(bundleId, indexes) {
    setBusy(true);
    try {
      let exam = examId
        ? await request(`/teacher/exams/${examId}`)
        : await request('/teacher/exams', {
            method: 'POST',
            body: {
              title: 'A new practice exam',
              visibility: 'private',
              currency: 'NGN',
              priceMinor: 0,
              questions: [],
            },
          });
      await request(`/teacher/exams/${exam.id}/import-library`, {
        method: 'POST',
        body: { bundleId, indexes, revision: exam.revision },
      });
      setPicker(false);
      notify('Questions added. Your new draft is ready to shape.');
      go(`exams/${exam.id}/edit`);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="PASTQ RESOURCES"
        title="Question library"
        text="Explore the shared PastQ library and build practice around what students need."
      />
      <section className="library-hero">
        <span className="library-art">
          <Library size={65} strokeWidth={0.8} />
        </span>
        <div>
          <span className="eyebrow">THE PASTQ QUESTION LIBRARY</span>
          <h2>Build from the PastQ library</h2>
          <p>
            Pick individual questions from real collections. Keep the source diagrams, answers, and
            explanations.
          </p>
          <Button
            variant="primary"
            icon={BookOpen}
            onClick={() => {
              setInitialBundleId(null);
              setPicker(true);
            }}
          >
            Explore collections
          </Button>
        </div>
      </section>
      <section className="panel padded library-destination">
        <h3>Choose a destination</h3>
        <p>Choose an existing draft or start a fresh one.</p>
        <label>
          Exam destination
          <select value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Create a new private draft</option>
            {drafts.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </section>
      <ErrorBox error={error} />
      <CollectionGrid
        onOpen={(bundle) => {
          setInitialBundleId(bundle.id);
          setPicker(true);
        }}
      />
      {picker && (
        <LibraryPicker
          initialBundleId={initialBundleId}
          onClose={() => setPicker(false)}
          onImport={add}
          busy={busy}
        />
      )}
    </>
  );
}
function collectionName(b) {
  return b.title || b.name || 'Question collection';
}
export function CollectionGrid({ onOpen }) {
  const { data, error, loading } = useResource('/teacher/library'),
    [search, setSearch] = useState('');
  const rows = (data?.items || []).filter((b) =>
    `${collectionName(b)} ${b.organization?.name || b.university || ''} ${(b.libraryStats?.subjects || b.subjects || []).join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-toolbar">
        <h2>Explore collections</h2>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search collections"
            placeholder="Find a subject or exam"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading label="Opening the PastQ library…" />
      ) : rows.length ? (
        <div className="collection-grid">
          {rows.map((b) => (
            <button className="collection-card" key={b.id} onClick={() => onOpen(b)}>
              <span className="collection-icon">
                <BookOpen size={24} strokeWidth={1.3} />
              </span>
              <small>{b.organization?.name || b.university || 'PastQ library'}</small>
              <h3>{collectionName(b)}</h3>
              <span>
                {b.question_count || b.libraryStats?.questionCount || b.questions?.length || 0}{' '}
                questions
                <ArrowUpRightIcon />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No matching collections."
          text={
            search
              ? 'Try a broader subject or exam name.'
              : 'Shared question collections will appear here when the PastQ API is connected.'
          }
        />
      )}
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={17} style={{ transform: 'rotate(-35deg)' }} />;
}
export function LibraryPicker({
  onClose,
  onImport,
  busy,
  initialBundleId = null,
  initialTopic = '',
}) {
  const list = useResource('/teacher/library'),
    [bundleId, setBundleId] = useState(initialBundleId);
  const [bundle, setBundle] = useState(null),
    [selected, setSelected] = useState(new Set()),
    [search, setSearch] = useState(initialTopic),
    [subject, setSubject] = useState('');
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!bundleId) {
      setBundle(null);
      setSelected(new Set());
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ search, subject, offset: String(offset), limit: '30' });
      request('/teacher/library/' + bundleId + '?' + query)
        .then((data) => {
          if (active) {
            setBundle(data);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [bundleId, search, subject, offset]);
  const rows = (bundle?.questions || []).map((q, index) => ({ q, index: q.sourceIndex ?? index }));
  function toggle(index) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }
  return (
    <Modal
      wide
      title={bundle ? collectionName(bundle) : 'Explore the question library'}
      subtitle={
        bundle
          ? selected.size + ' selected · choose the questions that fit your students.'
          : 'Real collections. Your choice of questions.'
      }
      onClose={onClose}
    >
      <ErrorBox error={error || list.error} />
      {bundleId ? (
        <>
          <button
            className="back-link"
            onClick={() => {
              setBundleId(null);
              setSearch('');
              setSubject('');
              setOffset(0);
            }}
          >
            <ArrowLeft size={15} />
            All collections
          </button>
          <div className="picker-filters">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Filter questions by topic or wording"
                placeholder="Find a topic or question"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <select
              aria-label="Filter library subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All subjects</option>
              {(bundle?.subjects || []).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <Loading />
          ) : (
            bundle && (
              <>
                <div className="picker-selection">
                  <span>{bundle.total ?? rows.length} matching questions</span>
                  <button
                    className="text-btn"
                    onClick={() =>
                      setSelected((current) => new Set([...current, ...rows.map((r) => r.index)]))
                    }
                  >
                    Select this page
                  </button>
                  <button className="text-btn" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </div>
                <div className="library-question-list">
                  {rows.map(({ q, index }) => (
                    <label
                      className={'library-question ' + (selected.has(index) ? 'selected' : '')}
                      key={index}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggle(index)}
                      />
                      <span className="grow">
                        <span className="question-tags">
                          <span>{q.subject}</span>
                          <span>{q.topic || q.section || 'Unsectioned'}</span>
                          <span>{q.year || 'Topic practice'}</span>
                        </span>
                        <SourceContent question={q} assets={bundle.assets} />
                        <small>
                          {q.options?.length ? q.options.length + ' choices' : 'Written response'}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                {!rows.length && (
                  <Empty
                    title="No matching questions."
                    text="Try a broader topic or another subject."
                  />
                )}
                <div className="picker-pagination">
                  <Button disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 30))}>
                    Previous
                  </Button>
                  <small>
                    {rows.length ? offset + 1 : 0}–{offset + rows.length} of{' '}
                    {bundle.total ?? rows.length}
                  </small>
                  <Button
                    disabled={offset + 30 >= (bundle.total ?? rows.length)}
                    onClick={() => setOffset((n) => n + 30)}
                  >
                    Next
                  </Button>
                </div>
                <div className="modal-actions sticky">
                  <span>{selected.size} selected</span>
                  <Button
                    variant="primary"
                    icon={Plus}
                    disabled={busy || !selected.size || selected.size > 1000}
                    onClick={async () => {
                      try {
                        await onImport(bundle.id, [...selected]);
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {busy ? 'Adding questions…' : 'Add to exam'}
                  </Button>
                </div>
              </>
            )
          )}
        </>
      ) : list.loading ? (
        <Loading />
      ) : (
        <div className="picker-collections">
          {(list.data?.items || []).map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBundleId(b.id);
                setOffset(0);
              }}
            >
              <span className="exam-icon">
                <BookOpen size={22} />
              </span>
              <span>
                <strong>{collectionName(b)}</strong>
                <small>
                  {b.question_count || b.libraryStats?.questionCount || b.questions?.length || 0}{' '}
                  questions
                </small>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
          {!list.data?.items?.length && (
            <Empty
              title="The library is waiting for a connection."
              text="Start the matching PastQ API to explore shared questions."
            />
          )}
        </div>
      )}
    </Modal>
  );
}
