import { ArrowUpRight } from 'lucide-react';
import { Badge, MiniBar, money, percent, when } from './components';

export function StudentCards({ rows, onStudent }) {
  return (
    <div className="student-result-cards">
      {rows.map((student) => (
        <article className="student-result-card" key={student.userId}>
          <div className="student-card-header">
            <span className="avatar">
              {student.name
                .split(' ')
                .slice(0, 2)
                .map((name) => name[0])
                .join('')}
            </span>
            <div className="grow">
              <strong>{student.name}</strong>
              <small>{student.email}</small>
            </div>
            {student.pending && <Badge status="draft">Needs grading</Badge>}
          </div>
          <div className="student-score-grid">
            <div>
              <span>Attempts</span>
              <strong>{student.attempts}</strong>
            </div>
            <div>
              <span>Best score</span>
              <strong>{percent(student.best)}</strong>
            </div>
            <div>
              <span>Latest score</span>
              <strong>{student.pending ? 'Pending' : percent(student.latest)}</strong>
            </div>
          </div>
          {student.inProgress && <p className="student-card-topics">Attempt in progress</p>}
          <p className="student-card-topics">
            <strong>Topics to revisit: </strong>
            {student.weakTopics.length ? student.weakTopics.join(', ') : 'No graded gaps recorded.'}
          </p>
          <button className="text-btn" onClick={() => onStudent(student)}>
            View answers & attempts
            <ArrowUpRight size={18} />
          </button>
        </article>
      ))}
    </div>
  );
}
export function QuestionCards({ rows }) {
  return (
    <div className="question-performance-cards">
      {rows.map((q, index) => (
        <article className="question-performance-card" key={q.key}>
          <div className="question-tags">
            <strong>Q{q.number ?? index + 1}</strong>
            <span>{q.topic}</span>
          </div>
          <p>{q.question}</p>
          <div className="question-performance-result">
            <span>
              <strong>{percent(q.accuracy)}</strong> correct
            </span>
            <span>
              {q.unanswered} of {q.seen} unanswered
            </span>
          </div>
          <MiniBar value={q.accuracy} />
          <div className="distractors">
            {q.choices.map((count, index) => (
              <span key={index}>
                {String.fromCharCode(65 + index)}
                <b>{count} chose</b>
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
export function PaymentCards({ rows }) {
  return (
    <div className="payment-cards">
      {rows.map((order) => (
        <article className="payment-card" key={order.id}>
          <div>
            <strong>{order.name || order.email}</strong>
            <strong>{money(order.amount, order.currency)}</strong>
          </div>
          <div>
            <Badge status={order.status === 'paid' ? 'open' : 'draft'}>{order.status}</Badge>
            <small>{when(order.createdAt)}</small>
          </div>
          <small>{order.email}</small>
        </article>
      ))}
    </div>
  );
}
