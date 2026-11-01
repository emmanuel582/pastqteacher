import { useState } from 'react';
import { Search, Clock3, LockKeyhole, Globe2 } from 'lucide-react';
import { Plus, ArrowUpRight, Files } from 'lucide-react';

import { mediaUrl } from '../api';
import { Heading, Badge, Button, Empty, ErrorBox, Loading, money } from '../components';
export default function Exams({ exams, loading, error, go }) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const rows = exams.filter(
    (e) =>
      (filter === 'all' || e.status === filter) &&
      `${e.title} ${e.subject}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="EXAM MANAGEMENT"
        title="My exams"
        text="Create, publish, and manage your exam sessions."
        action={
          <Button variant="primary" icon={Plus} onClick={() => go('exams/new')}>
            Create exam
          </Button>
        }
      />
      <div className="list-toolbar">
        <div className="tabs">
          {['all', 'open', 'draft', 'closed', 'archived'].map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all'
                ? 'All exams'
                : f === 'open'
                  ? 'Published'
                  : f[0].toUpperCase() + f.slice(1)}
              <span>{exams.filter((e) => f === 'all' || e.status === f).length}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Find an exam"
            aria-label="Search exams"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : rows.length ? (
        <div className="exam-cards">
          {rows.map((e) => (
            <article className="exam-card" key={e.id}>
              <div className="exam-card-top">
                <span className="exam-icon">
                  {e.logo ? (
                    <img src={mediaUrl(e.logo)} alt="" />
                  ) : (
                    <Files size={25} strokeWidth={1.3} />
                  )}
                </span>
                <Badge status={e.status} />
              </div>
              <small className="eyebrow">{e.subject || 'YOUR EXAM'}</small>
              <h2>
                <button onClick={() => go(`exams/${e.id}`)}>{e.title}</button>
              </h2>
              <p>{e.description || 'No exam description added.'}</p>
              <div className="exam-card-meta">
                <span>
                  <Files size={14} />
                  {e.questionCount} questions
                </span>
                <span>
                  <Clock3 size={14} />
                  {e.settings.durationMinutes} min
                </span>
              </div>
              <div className="exam-card-footer">
                <span>
                  {e.visibility === 'private' ? <LockKeyhole size={14} /> : <Globe2 size={14} />}{' '}
                  {e.visibility === 'private' ? 'Private' : 'Public'} <i />{' '}
                  {e.priceMinor ? money(e.priceMinor, e.currency) : 'Free'}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Open ${e.title}`}
                  onClick={() => go(`exams/${e.id}`)}
                >
                  <ArrowUpRight size={20} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={search ? 'No matching exams.' : 'No exams yet'}
          text="Create an exam from an upload, the library, or your own questions."
          action={
            <Button icon={Plus} onClick={() => go('exams/new')}>
              Create exam
            </Button>
          }
        />
      )}
    </>
  );
}
