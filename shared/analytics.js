export function analytics(exam, attempts, members) {
  const completed = attempts.filter((a) => a.status === 'submitted');
  const graded = completed.filter((a) => a.result.pending === 0);
  const topics = new Map(),
    questionStats = new Map(
      exam.questions.map((q, index) => [
        q.key,
        {
          key: q.key,
          number: index + 1,
          question: q.question,
          topic: q.topic,
          subject: q.subject,
          seen: 0,
          graded: 0,
          correct: 0,
          unanswered: 0,
          choices: q.options.map(() => 0),
        },
      ]),
    );
  for (const attempt of completed)
    for (const outcome of attempt.result.outcomes) {
      const id = `${outcome.subject}:${outcome.topic}`;
      const t = topics.get(id) || {
        subject: outcome.subject,
        topic: outcome.topic,
        correct: 0,
        answered: 0,
        unanswered: 0,
        pending: 0,
        students: new Set(),
      };
      if (outcome.correct === null) t.pending++;
      else {
        t.answered++;
        t.correct += outcome.correct ? 1 : 0;
        if (!outcome.correct) t.students.add(attempt.userId);
      }
      t.unanswered += outcome.unanswered ? 1 : 0;
      topics.set(id, t);
      const q = questionStats.get(outcome.key);
      if (q) {
        q.seen++;
        if (outcome.correct !== null) q.graded++;
        q.correct += outcome.correct ? 1 : 0;
        q.unanswered += outcome.unanswered ? 1 : 0;
        const choice = outcome.choice ?? outcome.answer;
        if (Number.isInteger(choice)) q.choices[choice]++;
      }
    }
  const students = members.map((m) => {
    const rows = completed.filter((a) => a.userId === m.userId),
      scores = rows.filter((a) => !a.result.pending).map((a) => a.result.percent);
    return {
      ...m,
      attempts: rows.length,
      inProgress: attempts.some((a) => a.userId === m.userId && a.status === 'in_progress'),
      best: scores.length ? Math.max(...scores) : null,
      latest: rows.at(-1)?.result.percent ?? null,
      pending: rows.some((a) => a.result.pending),
      totalSeconds: rows.reduce((sum, a) => sum + a.durationSeconds, 0),
      improvement: scores.length > 1 ? scores.at(-1) - scores[0] : null,
      weakTopics: [
        ...new Set(
          rows.flatMap((a) =>
            a.result.outcomes.filter((o) => o.correct === false).map((o) => o.topic),
          ),
        ),
      ],
      history: rows.map((a) => ({
        id: a.id,
        percent: a.result.percent,
        pending: a.result.pending,
        completedAt: a.submittedAt,
        durationSeconds: a.durationSeconds,
      })),
    };
  });
  const distribution = [0, 20, 40, 60, 80].map((min) => ({
    label: `${min}–${min === 80 ? 100 : min + 19}%`,
    count: graded.filter(
      (a) => a.result.percent >= min && (min === 80 || a.result.percent < min + 20),
    ).length,
  }));
  return {
    enrolled: members.length,
    completedStudents: new Set(completed.map((a) => a.userId)).size,
    attempts: completed.length,
    gradedAttempts: graded.length,
    pendingGrading: completed.filter((a) => a.result.pending).length,
    average: graded.length
      ? graded.reduce((n, a) => n + a.result.percent, 0) / graded.length
      : null,
    passRate: graded.length
      ? (graded.filter((a) => a.result.percent >= exam.settings.passMark).length / graded.length) *
        100
      : null,
    averageSeconds: completed.length
      ? completed.reduce((n, a) => n + a.durationSeconds, 0) / completed.length
      : null,
    topics: [...topics.values()]
      .map((t) => ({
        ...t,
        students: t.students.size,
        accuracy: t.answered ? (t.correct / t.answered) * 100 : null,
      }))
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)),
    questions: [...questionStats.values()]
      .map((q) => ({ ...q, accuracy: q.graded ? (q.correct / q.graded) * 100 : null }))
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)),
    students,
    distribution,
  };
}
