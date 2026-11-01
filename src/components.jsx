import { useEffect, useRef } from 'react';
import { X, Loader2, BookOpen, ChevronRight, Check } from 'lucide-react';
import { sourceHtmlFragment } from './sourceHtml';
import { mediaUrl } from './api';
export const money = (minor, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
export const percent = (n) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);
export const when = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Any time';
export function Brand() {
  return (
    <span className="brand">
      past<span>q</span>
      <i /> <small>for teachers</small>
    </span>
  );
}
export function Heading({ eyebrow, title, text, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}
export function Button({ children, icon: Icon, variant = '', className = '', ...props }) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
export function Badge({ children, status = '' }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {children ||
        {
          open: 'Published',
          draft: 'Draft',
          closed: 'Closed',
          archived: 'Archived',
          private: 'Private',
          public: 'Public',
        }[status] ||
        status}
    </span>
  );
}
export function Empty({ title, text, action, icon: Icon = BookOpen }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={27} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Loading({ label = 'Opening your workspace…' }) {
  return (
    <div className="loading" role="status">
      <Loader2 size={24} className="spin" />
      <span>{label}</span>
    </div>
  );
}
export function ErrorBox({ error, retry }) {
  return error ? (
    <div className="error" role="alert">
      <span>{error}</span>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  ) : null;
}
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Stat({ label, value, foot, icon: Icon }) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        {Icon && <Icon size={17} strokeWidth={1.5} />}
      </div>
      <strong>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}
export function RichContent({ text = '', html, assets }) {
  return <SourceContent question={{ question: text, questionHtml: html }} assets={assets} />;
}
export function SourceContent({ question, assets, children }) {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    ref.current.replaceChildren(
      question?.questionHtml
        ? sourceHtmlFragment(question.questionHtml, assets)
        : document.createTextNode(question?.question || ''),
    );
    const element = ref.current;
    let active = true;
    if (/\$|\\\(|\\\[/.test(element.textContent)) {
      import('./math')
        .then(({ renderMath }) => {
          if (active) renderMath(element);
        })
        .catch(() => {
          /* The original source remains readable if a chunk cannot load. */
        });
    }
    return () => {
      active = false;
    };
  }, [question, assets]);
  return (
    <div className="source-content">
      <div ref={ref} />
      {question?.passage && <blockquote>{question.passage}</blockquote>}
      {question?.figures?.map(
        (f, i) =>
          f.url && (
            <figure key={i}>
              <img src={mediaUrl(f.url)} alt={f.description || f.caption || 'Question figure'} />
              {f.caption && <figcaption>{f.caption}</figcaption>}
            </figure>
          ),
      )}
      {children}
    </div>
  );
}
export function MiniBar({ value, label }) {
  return (
    <span className="mini-bar" aria-label={label}>
      <i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </span>
  );
}
export function Steps({ current, onStep }) {
  return (
    <nav className="steps" aria-label="Exam creation steps">
      {['Details', 'Questions', 'Settings', 'Review'].map((name, index) => (
        <button
          key={name}
          className={current === index ? 'active' : ''}
          aria-current={current === index ? 'step' : undefined}
          onClick={() => onStep(index)}
        >
          <span>{current > index ? <Check size={12} /> : index + 1}</span>
          {name}
          {index < 3 && <ChevronRight size={12} />}
        </button>
      ))}
    </nav>
  );
}
