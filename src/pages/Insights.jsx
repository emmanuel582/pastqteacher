import { useState } from 'react';

import { Heading, Button, Empty } from '../components';
import ExamDetail from '../ExamDetail';
export default function Insights({ exams, go, version, studentView }) {
  const [id, setId] = useState(exams.find((e) => e.status !== 'draft')?.id || '');
  return (
    <>
      <Heading
        eyebrow={studentView ? 'STUDENT RESULTS' : 'EXAM ANALYSIS'}
        title={studentView ? 'Student results' : 'Performance insights'}
        text={
          studentView
            ? 'Review attempts, scores, and topics for each student.'
            : 'Compare topic results and find questions for follow-up practice.'
        }
      />
      <label className="select-exam">
        Choose an exam
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Select exam</option>
          {exams
            .filter((e) => e.status !== 'draft')
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
        </select>
      </label>
      {id ? (
        <ExamDetail
          key={id}
          id={id}
          go={go}
          version={version}
          embedded={studentView ? 'students' : 'analysis'}
        />
      ) : (
        <Empty
          title="Select an exam"
          text="Publish an exam to start collecting useful learning insights."
          action={<Button onClick={() => go('exams')}>Open my exams</Button>}
        />
      )}
    </>
  );
}
