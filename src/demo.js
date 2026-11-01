import { analytics } from '../shared/analytics.js';
// Explicit, isolated UI preview. Never used by authenticated workspaces.
const settings = {
  durationMinutes: 25,
  maxAttempts: 2,
  passMark: 60,
  negativeMark: 0,
  shuffleQuestions: true,
  shuffleOptions: true,
  resultRelease: 'manual',
  showSolutions: true,
  startsAt: null,
  endsAt: null,
  capacity: 0,
  instructions: 'Take your time with each calculation. You may use your working paper.',
};
const questions = [
  {
    question: 'How many moles are present in 11 g of carbon dioxide? (C = 12, O = 16)',
    options: ['0.125 mol', '0.25 mol', '0.5 mol', '1.0 mol'],
    correct: 1,
    topic: 'Stoichiometry',
    explanation: 'The molar mass of CO₂ is 44 g/mol. Amount = 11 ÷ 44 = 0.25 mol.',
  },
  {
    question:
      'What mass of sodium chloride is required to prepare 250 cm³ of a 0.1 mol/dm³ solution? (Na = 23, Cl = 35.5)',
    options: ['0.585 g', '1.463 g', '5.85 g', '14.63 g'],
    correct: 1,
    topic: 'Stoichiometry',
    explanation: 'n = 0.1 × 0.25 = 0.025 mol. Mass = 0.025 × 58.5 = 1.4625 g.',
  },
  {
    question: 'Which particle determines the atomic number of an element?',
    options: ['Neutron', 'Electron', 'Proton', 'Nucleon'],
    correct: 2,
    topic: 'Atomic structure',
    explanation: 'Atomic number is the number of protons in the nucleus.',
  },
  {
    question: 'Which bond is formed by the sharing of a pair of electrons?',
    options: ['Ionic bond', 'Metallic bond', 'Hydrogen bond', 'Covalent bond'],
    correct: 3,
    topic: 'Chemical bonding',
    explanation: 'A covalent bond forms through a shared pair of electrons.',
  },
  {
    question:
      'For an exothermic reaction at equilibrium, increasing temperature will favour which direction?',
    options: ['The forward reaction', 'The reverse reaction', 'Both equally', 'Neither reaction'],
    correct: 1,
    topic: 'Chemical equilibrium',
    explanation:
      'Heat is a product of an exothermic reaction. Adding heat favours the reverse reaction.',
  },
  {
    question: 'A solution with a pH of 3 has what hydrogen ion concentration?',
    options: ['0.001 mol/dm³', '0.003 mol/dm³', '3 mol/dm³', '1000 mol/dm³'],
    correct: 0,
    topic: 'Acids & bases',
    explanation: '[H⁺] = 10⁻³ mol/dm³.',
  },
  {
    question:
      'What volume does one mole of an ideal gas occupy at standard temperature and pressure?',
    options: ['11.2 dm³', '22.4 dm³', '24.0 dm³', '44.8 dm³'],
    correct: 1,
    topic: 'Stoichiometry',
    explanation: 'At 0°C and 1 atm, one mole occupies approximately 22.4 dm³.',
  },
  {
    question:
      'Which of these factors does NOT change the equilibrium constant of a reaction at a fixed temperature?',
    options: ['A catalyst', 'Temperature', 'Reaction identity', 'The defined standard state'],
    correct: 0,
    topic: 'Chemical equilibrium',
    explanation:
      'A catalyst speeds both directions equally without changing the equilibrium constant.',
  },
].map((q, i) => ({
  ...q,
  key: `demo-q-${i}`,
  type: 'mcq',
  subject: 'Chemistry',
  marks: 1,
  answerText: '',
}));
let profile = {
  id: 'demo-teacher',
  name: 'Ada Okafor',
  organization: 'The Learning Room',
  email: 'ada@example.test',
  logo: null,
};
let exams = [
  {
    id: 'demo-chemistry',
    title: 'Chemistry practice exam',
    subject: 'Chemistry',
    description: 'A timed practice exam covering five core chemistry topics.',
    visibility: 'private',
    status: 'open',
    priceMinor: 0,
    currency: 'NGN',
    inviteCode: 'A7C94E12F83B6D05',
    questions,
    settings,
    revision: 1,
    createdAt: new Date().toISOString(),
    assets: {},
    resultsReleased: false,
  },
  {
    id: 'demo-revision',
    title: 'Stoichiometry revision',
    subject: 'Chemistry',
    description: 'Focused practice on mole calculations and reaction quantities.',
    visibility: 'private',
    status: 'draft',
    priceMinor: 0,
    currency: 'NGN',
    questions: questions.filter((q) => q.topic === 'Stoichiometry'),
    settings: { ...settings, durationMinutes: 15, maxAttempts: 3 },
    revision: 1,
    createdAt: new Date().toISOString(),
    assets: {},
    resultsReleased: false,
  },
  {
    id: 'demo-bonds',
    title: 'Atomic structure & bonding',
    subject: 'Chemistry',
    description: 'Revision questions on atomic structure and chemical bonds.',
    visibility: 'public',
    status: 'closed',
    priceMinor: 0,
    currency: 'NGN',
    questions: questions.filter((q) => ['Chemical bonding', 'Atomic structure'].includes(q.topic)),
    settings: { ...settings, durationMinutes: 10 },
    revision: 1,
    createdAt: new Date().toISOString(),
    assets: {},
    resultsReleased: true,
  },
];
const names = [
  'Amara Nwosu',
  'Tunde Adeyemi',
  'Zainab Bello',
  'Chinedu Eze',
  'Fatima Ibrahim',
  'David Okonkwo',
  'Blessing Udo',
  'Ibrahim Musa',
];
const sampleExamIds = new Set(['demo-chemistry', 'demo-bonds']);
const missed = [
  [0, 1],
  [0, 1, 4],
  [0],
  [0, 1, 4, 7],
  [0, 4, 6],
  [0, 1, 4, 6, 7],
  [1, 7],
  [0, 1, 4, 6],
];
const demoAttempts = new Map();
const sampleTime = Date.now() - 2 * 3600000;
function report(exam) {
  if (!sampleExamIds.has(exam.id)) return analytics(exam, [], []);
  const members = names.map((name, i) => ({
    userId: `demo-student-${i}`,
    name,
    email: `${name.split(' ')[0].toLowerCase()}@example.test`,
  }));
  const attempts = members.flatMap((member, i) =>
    (i === 3 ? [1, 2] : [1]).map((number) => {
      const wrong = new Set([...missed[i], ...(i === 3 && number === 1 ? [5] : [])]);
      const outcomes = exam.questions.map((q, index) => {
        const answer = wrong.has(index) ? (q.correct + 1) % q.options.length : q.correct;
        return {
          key: q.key,
          subject: q.subject,
          topic: q.topic,
          answer,
          choice: answer,
          correct: answer === q.correct,
          unanswered: false,
          score: answer === q.correct ? q.marks : 0,
          possible: q.marks,
        };
      });
      const earned = outcomes.reduce((sum, o) => sum + o.score, 0);
      const possible = outcomes.reduce((sum, o) => sum + o.possible, 0);
      const durationSeconds = 600 + i * 30;
      const submittedAt = new Date(
        sampleTime - i * 3600000 - (number === 1 && i === 3 ? 86400000 : 0),
      ).toISOString();
      const attempt = {
        id: `${exam.id}-attempt-${i}-${number}`,
        examId: exam.id,
        userId: member.userId,
        number,
        status: 'submitted',
        submittedAt,
        durationSeconds,
        startedAt: new Date(Date.parse(submittedAt) - durationSeconds * 1000).toISOString(),
        questions: exam.questions,
        assets: exam.assets,
        manual: {},
        answers: Object.fromEntries(outcomes.map((o) => [o.key, o.answer])),
        result: {
          earned,
          possible,
          percent: possible ? (earned / possible) * 100 : 0,
          pending: 0,
          outcomes,
        },
      };
      demoAttempts.set(attempt.id, attempt);
      return attempt;
    }),
  );
  return analytics(exam, attempts, members);
}
const collection = {
  id: 'demo-collection',
  title: 'Chemistry · Foundation practice',
  organization: { name: 'PastQ sample collection' },
  question_count: questions.length,
  subjects: ['Chemistry'],
  questions,
  assets: {},
};
export async function demoApi(path, options = {}) {
  const method = options.method || 'GET',
    body = options.body || {},
    parts = path.split('/').filter(Boolean);
  if (path === '/teacher/me')
    return { user: profile, profile, payments: { configured: false, environment: 'sandbox' } };
  if (path === '/teacher/profile') {
    profile = { ...profile, ...body };
    return profile;
  }
  if (path === '/teacher/exams' && method === 'GET')
    return {
      items: exams.map((e) => ({
        ...e,
        questionCount: e.questions.length,
        enrolled: report(e).enrolled,
        completed: report(e).completedStudents,
      })),
    };
  if (path === '/teacher/exams' && method === 'POST') {
    const e = {
      ...body,
      id: crypto.randomUUID(),
      settings: { ...settings, ...body.settings },
      questions: body.questions || [],
      revision: 1,
      assets: {},
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    exams.unshift(e);
    return structuredClone(e);
  }
  if (path === '/teacher/uploads') return { items: [] };
  if (path === '/teacher/library') return { items: [collection] };
  if (path.startsWith('/teacher/library/')) {
    const query = new URL(path, 'https://demo.invalid').searchParams,
      needle = (query.get('search') || '').toLowerCase(),
      subject = query.get('subject') || '',
      offset = Number(query.get('offset')) || 0;
    const rows = questions
      .map((q, sourceIndex) => ({ ...q, sourceIndex }))
      .filter(
        (q) =>
          (!subject || q.subject === subject) &&
          `${q.question} ${q.topic}`.toLowerCase().includes(needle),
      );
    return {
      ...collection,
      questions: rows.slice(offset, offset + 30),
      total: rows.length,
      offset,
      subjects: ['Chemistry'],
    };
  }
  if (path === '/teacher/payments')
    return { configured: false, environment: 'sandbox', account: null, orders: [] };
  if (path.startsWith('/teacher/attempts/')) {
    exams.forEach(report);
    const attempt = demoAttempts.get(parts[2]);
    if (!attempt) throw new Error('This sample attempt is unavailable.');
    return structuredClone(attempt);
  }
  const e = exams.find((e) => e.id === parts[2]);
  if (!e) throw new Error('This action uses your connected account. Exit the demo to continue.');
  if (parts[3] === 'analysis') return report(e);
  if (parts[3] === 'recommendations')
    return {
      topics: report(e).topics.filter((t) => t.accuracy < 65),
      items: [
        { ...collection, matchedTopics: ['Stoichiometry', 'Chemical equilibrium'], relevance: 2 },
      ],
    };
  if (parts[3] === 'import-library') {
    e.questions.push(...body.indexes.map((i) => ({ ...questions[i], key: crypto.randomUUID() })));
    e.revision++;
    return structuredClone(e);
  }
  if (parts[3] === 'duplicate') {
    const copy = {
      ...structuredClone(e),
      id: crypto.randomUUID(),
      title: `${e.title} · copy`,
      status: 'draft',
      revision: 1,
      inviteCode: null,
    };
    exams.unshift(copy);
    return copy;
  }
  if (parts[3] === 'publish') {
    if (!e.questions.length || e.questions.some((q) => q.type !== 'theory' && q.correct === null))
      throw new Error('Add questions and answer keys before publishing.');
    if (e.priceMinor) throw new Error('Connect a real Bachs account to publish paid exams.');
    e.status = 'open';
    if (e.visibility === 'private') e.inviteCode = 'B319F0C27A4D8E65';
    return structuredClone(e);
  }
  if (parts[3] === 'rotate-code') {
    e.inviteCode = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
    return { inviteCode: e.inviteCode };
  }
  if (parts[3] === 'action') {
    if (body.action === 'release') e.resultsReleased = true;
    else e.status = { close: 'closed', reopen: 'open', archive: 'archived' }[body.action];
    return structuredClone(e);
  }
  if (method === 'PUT' && parts.length === 3) {
    Object.assign(e, body, { revision: e.revision + 1 });
    return structuredClone(e);
  }
  if (parts.length === 3) return structuredClone(e);
  throw new Error(
    'This feature needs a connected workspace. Demo changes never reach the real app.',
  );
}
