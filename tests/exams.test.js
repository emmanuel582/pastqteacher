import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import {
  defaults,
  validateExam,
  grade,
  safeQuestions,
  analytics,
  released,
} from '../server/domain.js';
import { verifyWebhook, createBachs } from '../server/bachs.js';
const q = (key = 'moles') => ({
  key,
  type: 'mcq',
  question: 'How many moles are in 11 g CO₂?',
  options: ['0.25', '0.5', '1', '2'],
  correct: 0,
  subject: 'Chemistry',
  topic: 'Stoichiometry',
  explanation: '11 / 44 = 0.25',
  marks: 2,
});
const user = (id) => ({
  id,
  email: `${id}@example.test`,
  user_metadata: { full_name: id },
  app_metadata: {},
});
const draft = (overrides = {}) => ({
  title: 'Chemistry check-in',
  visibility: 'private',
  priceMinor: 0,
  currency: 'NGN',
  settings: { ...defaults(), shuffleOptions: false, shuffleQuestions: false },
  questions: [q()],
  ...overrides,
});
test('pending written answers stay out of accuracy and archived exams retain closed results', () => {
  const exam = draft({
    status: 'archived',
    settings: { ...defaults(), resultRelease: 'after_close' },
  });
  assert.equal(released(exam), true);
  const result = analytics(
    exam,
    [
      {
        status: 'submitted',
        userId: 's1',
        durationSeconds: 60,
        result: {
          pending: 1,
          outcomes: [
            {
              key: 'moles',
              subject: 'Chemistry',
              topic: 'Stoichiometry',
              correct: null,
              unanswered: false,
            },
          ],
        },
      },
    ],
    [],
  );
  assert.equal(result.questions[0].accuracy, null);
  assert.equal(result.gradedAttempts, 0);
  assert.equal(result.average, null);
});
test('option analysis uses original choice positions after per-attempt shuffling', () => {
  const question = {
    ...q(),
    options: ['1', '0.25', '2', '0.5'],
    optionOrder: [2, 0, 3, 1],
    correct: 1,
  };
  const result = grade([question], { moles: 1 }, defaults());
  const report = analytics(
    draft(),
    [{ status: 'submitted', result, userId: 's', durationSeconds: 10 }],
    [],
  );
  assert.deepEqual(report.questions[0].choices, [1, 0, 0, 0]);
  assert.equal(report.questions[0].number, 1);
  assert.equal(safeQuestions([question])[0].optionOrder, undefined);
});
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastq-teacher-'));
  const secret = 'test-secret-with-at-least-32-characters';
  const store = createStore(dir, secret);
  store.saveProfile('teacher-a', { ...user('teacher-a'), name: 'Ada', organization: 'School' });
  t.after(() => {
    store.close();
    const root = path.resolve(os.tmpdir()) + path.sep;
    if (!path.resolve(dir).startsWith(root) || !path.basename(dir).startsWith('pastq-teacher-'))
      throw new Error('Unsafe cleanup directory');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, secret, store };
}
test('drafts, ownership, codes and published question snapshots are isolated', (t) => {
  const { store } = setup(t),
    exam = store.create('teacher-a', draft());
  assert.equal(store.discover('student').length, 0);
  assert.throws(
    () => store.owned('teacher-b', exam.id),
    (e) => e.status === 404,
  );
  assert.throws(
    () => store.resolve(exam.id, null, 'student'),
    (e) => e.status === 404,
  );
  const live = store.publish('teacher-a', exam.id);
  assert.equal(live.inviteCode.length, 16);
  assert.throws(
    () => store.resolve(exam.id, null, 'student'),
    (e) => e.status === 404,
  );
  const found = store.resolve(
    null,
    live.inviteCode
      .toLowerCase()
      .match(/.{1,4}/g)
      .join('-'),
    'student',
  );
  assert.equal(found.id, exam.id);
  assert.equal(JSON.stringify(store.publicExam(found, 'student')).includes('correct'), false);
  assert.equal(JSON.stringify(store.publicExam(found, 'student')).includes(live.inviteCode), false);
  store.enroll(exam.id, user('student'));
  assert.equal(store.resolve(exam.id, null, 'student').id, exam.id);
  assert.throws(
    () => store.update('teacher-a', exam.id, draft(), exam.revision),
    (e) => e.status === 409,
  );
  const rotated = store.rotate('teacher-a', exam.id);
  assert.notEqual(rotated.inviteCode, live.inviteCode);
  assert.throws(
    () => store.resolve(null, live.inviteCode, 'new-student'),
    (e) => e.status === 404,
  );
  assert.equal(store.resolve(exam.id, null, 'student').id, exam.id);
  const copy = store.duplicate('teacher-a', exam.id);
  assert.equal(copy.status, 'draft');
  assert.notEqual(copy.id, exam.id);
  assert.equal(copy.inviteCode, null);
});
test('grading, repeat submissions, retries, max attempts and result release use server state', (t) => {
  const { store } = setup(t);
  const exam = store.create(
    'teacher-a',
    draft({
      visibility: 'public',
      settings: {
        ...defaults(),
        resultRelease: 'manual',
        showSolutions: true,
        maxAttempts: 2,
        shuffleOptions: true,
      },
    }),
  );
  store.publish('teacher-a', exam.id);
  store.enroll(exam.id, user('s'));
  const a = store.start(exam.id, 's');
  assert.equal(store.start(exam.id, 's').id, a.id);
  const hidden = store.studentAttempt(a);
  assert.equal('correct' in hidden.questions[0], false);
  assert.equal('explanation' in hidden.questions[0], false);
  assert.equal(hidden.result, undefined);
  assert.equal(a.questions[0].options[a.questions[0].correct], '0.25');
  store.saveAnswers(a.id, 's', {
    revision: a.revision,
    answers: { moles: a.questions[0].correct },
  });
  assert.throws(
    () => store.saveAnswers(a.id, 's', { revision: 1, answers: {} }),
    (e) => e.status === 409,
  );
  assert.throws(
    () => store.saveAnswers(a.id, 'other', { revision: 2, answers: {} }),
    (e) => e.status === 404,
  );
  const submitted = store.submit(a.id, 's');
  assert.equal(submitted.result.percent, 100);
  assert.equal(store.submit(a.id, 's').result.percent, 100);
  assert.equal(store.studentAttempt(submitted).result, undefined);
  store.changeStatus('teacher-a', exam.id, 'release');
  assert.equal(store.studentAttempt(submitted).result.percent, 100);
  assert.equal(
    store.studentAttempt(submitted).questions[0].correct,
    submitted.questions[0].correct,
  );
  const second = store.start(exam.id, 's');
  assert.notEqual(second.id, a.id);
  store.submit(second.id, 's');
  assert.throws(
    () => store.start(exam.id, 's'),
    (e) => e.status === 409,
  );
  const report = store.report('teacher-a', exam.id);
  assert.equal(report.enrolled, 1);
  assert.equal(report.completedStudents, 1);
  assert.equal(report.attempts, 2);
  assert.equal(report.average, 50);
  assert.equal(report.students[0].attempts, 2);
  assert.equal(report.topics[0].accuracy, 50);
});
test('deadlines finalize saved work and cannot be extended or backdated by clients', (t) => {
  const { store } = setup(t),
    exam = store.create('teacher-a', draft());
  store.publish('teacher-a', exam.id);
  store.enroll(exam.id, user('s'));
  const a = store.start(exam.id, 's');
  store.saveAnswers(a.id, 's', { revision: 1, answers: { moles: 0 } });
  const row = store.db.prepare('SELECT data FROM attempts WHERE id=?').get(a.id),
    data = JSON.parse(row.data);
  data.deadline = new Date(Date.now() - 1000).toISOString();
  store.db.prepare('UPDATE attempts SET data=? WHERE id=?').run(JSON.stringify(data), a.id);
  const timedOut = store.attempt(a.id);
  assert.equal(timedOut.status, 'submitted');
  assert.equal(timedOut.result.percent, 100);
  assert.equal(timedOut.submittedAt, data.deadline);
  assert.throws(
    () => store.saveAnswers(a.id, 's', { revision: 2, answers: { moles: 1 } }),
    (e) => e.status === 409,
  );
});
test('written marks are private, bounded and excluded from final scores until graded', (t) => {
  const { store } = setup(t);
  const exam = store.create(
    'teacher-a',
    draft({
      questions: [
        {
          ...q(),
          type: 'theory',
          options: [],
          correct: null,
          answerText: 'mass divided by molar mass',
          marks: 5,
        },
      ],
    }),
  );
  store.publish('teacher-a', exam.id);
  store.enroll(exam.id, user('s'));
  const a = store.start(exam.id, 's');
  store.saveAnswers(a.id, 's', { revision: 1, answers: { moles: 'n = mass / molar mass' } });
  store.submit(a.id, 's');
  assert.equal(store.studentAttempt(store.attempt(a.id)).result, undefined);
  assert.equal(store.report('teacher-a', exam.id).average, null);
  assert.throws(
    () => store.manualGrade('teacher-b', a.id, { moles: 5 }),
    (e) => e.status === 404,
  );
  assert.throws(() => store.manualGrade('teacher-a', a.id, { moles: 6 }));
  const marked = store.manualGrade('teacher-a', a.id, { moles: 4 });
  assert.equal(marked.result.pending, 0);
  assert.equal(marked.result.percent, 80);
  assert.equal(store.report('teacher-a', exam.id).average, 80);
});
test('optimistic draft saves, schedules, answer keys, enrollment limits and negative marking', (t) => {
  const { store } = setup(t),
    e = store.create('teacher-a', draft());
  store.update('teacher-a', e.id, draft(), e.revision);
  assert.throws(
    () => store.update('teacher-a', e.id, draft(), e.revision),
    (err) => err.status === 409,
  );
  const broken = store.create('teacher-a', draft({ questions: [{ ...q(), correct: null }] }));
  assert.throws(() => store.publish('teacher-a', broken.id));
  const scheduled = store.create(
    'teacher-a',
    draft({
      settings: {
        ...defaults(),
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        capacity: 1,
      },
    }),
  );
  store.publish('teacher-a', scheduled.id);
  store.enroll(scheduled.id, user('s'));
  assert.throws(
    () => store.enroll(scheduled.id, user('second')),
    (err) => err.status === 409,
  );
  assert.throws(
    () => store.start(scheduled.id, 's'),
    (err) => err.status === 409,
  );
  assert.equal(
    grade([q(), q('second')], { moles: 0, second: 1 }, { ...defaults(), negativeMark: 0.25 })
      .earned,
    1.5,
  );
  assert.throws(() => validateExam(draft({ settings: { ...defaults(), endsAt: 'invalid' } })));
  assert.throws(() => validateExam(draft({ questions: [q(), q()] })));
});
test('SQLite preserves private invite codes and completed outcomes after reopening', (t) => {
  const { store, dir, secret } = setup(t),
    e = store.create('teacher-a', draft());
  const live = store.publish('teacher-a', e.id);
  const second = createStore(dir, secret);
  try {
    assert.equal(second.view(second.owned('teacher-a', e.id)).inviteCode, live.inviteCode);
    assert.equal(
      second.db
        .prepare('SELECT code_hash FROM exams WHERE id=?')
        .get(e.id)
        .code_hash.includes(live.inviteCode),
      false,
    );
  } finally {
    second.close();
  }
});
test('webhooks verify raw signatures, rotations, timestamp tolerance and grant exactly one paid enrollment', (t) => {
  const { store } = setup(t),
    exam = store.create('teacher-a', draft({ visibility: 'public', priceMinor: 50000 }));
  store.publish('teacher-a', exam.id, { productId: 'prod_1', paymentAccount: 'acct_teacher' });
  const order = store.createOrder(store.getExam(exam.id), user('s'));
  store.checkout(order.id, 'chk_paid', 'https://checkout.bachs.io/c/paid');
  assert.throws(
    () => store.enroll(exam.id, user('s')),
    (e) => e.status === 402,
  );
  const event = {
    id: 'evt_1',
    type: 'collection.succeeded',
    account: 'acct_teacher',
    data: {
      checkout_id: 'chk_paid',
      reference: order.id,
      amount: '500.00',
      currency: 'NGN',
      status: 'SUCCEEDED',
    },
  };
  const raw = Buffer.from(JSON.stringify(event)),
    stamp = String(Math.floor(Date.now() / 1000)),
    secret = 'webhook-secret';
  const signature = createHmac('sha256', secret).update(`${stamp}.`).update(raw).digest('hex');
  assert.equal(
    verifyWebhook(
      raw,
      { 'x-bachs-signature-v2': `t=${stamp},v1=${'0'.repeat(64)},v1=${signature}` },
      secret,
    ).id,
    event.id,
  );
  assert.throws(() =>
    verifyWebhook(
      Buffer.from('{}'),
      { 'x-bachs-timestamp': stamp, 'x-bachs-signature': signature },
      secret,
    ),
  );
  assert.throws(() =>
    verifyWebhook(raw, { 'x-bachs-timestamp': '1', 'x-bachs-signature': signature }, secret),
  );
  assert.throws(() => store.processPayment({ ...event, data: { ...event.data, amount: '1.00' } }));
  assert.equal(store.member(exam.id, 's'), null);
  store.processPayment(event);
  assert.equal(store.order(order.id).status, 'paid');
  assert.equal(store.member(exam.id, 's').paid, true);
  assert.equal(store.processPayment(event).duplicate, true);
  assert.equal(store.report('teacher-a', exam.id).enrolled, 1);
});
test('Bachs calls use decimal money, the documented connected-account header and stable idempotency', async () => {
  const calls = [];
  const bachs = createBachs(
    { apiKey: 'sk_sandbox_test', webhookSecret: 'secret', environment: 'sandbox' },
    async (url, init) => {
      calls.push({ url, ...init, body: JSON.parse(init.body) });
      return Response.json(
        url.endsWith('/products')
          ? { id: 'prod_1' }
          : { checkout_id: 'chk_1', checkout_url: 'https://sandbox-checkout.bachs.io/c/123' },
      );
    },
  );
  await bachs.product(
    { id: 'exam', revision: 2, title: 'Exam', priceMinor: 125050, currency: 'NGN' },
    'acct_teacher',
  );
  assert.equal(calls[0].headers['X-Account-Id'], 'acct_teacher');
  assert.equal(calls[0].body.price.amount, '1250.50');
  await bachs.checkout(
    {
      id: 'order',
      examId: 'exam',
      productId: 'prod_1',
      account: 'acct_teacher',
      email: 's@example.test',
      name: 'S',
      currency: 'NGN',
    },
    'https://students.example.test',
  );
  assert.equal(calls[1].body.reference, 'order');
  assert.equal(calls[1].headers['Idempotency-Key'], 'order');
  assert.equal(calls[1].body.product_cart[0].quantity, 1);
});
test('HTTP auth cannot be bypassed; teachers see only their own exam data; student APIs hide answers', async (t) => {
  const { store, dir } = setup(t);
  const config = {
    dataDir: dir,
    teacherOrigin: 'http://teacher.test',
    studentOrigin: 'http://student.test',
    pastqApi: 'http://pastq.test',
    bachs: {},
  };
  const app = createApp({
    store,
    config,
    authenticate: async (token) =>
      ['teacher-a', 'teacher-b', 'student'].includes(token) ? user(token) : null,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (url, token, method = 'GET', body) =>
    fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call('/teacher/exams')).status, 401);
  assert.equal((await call('/teacher/exams', 'student')).status, 403);
  const created = await call(
    '/teacher/exams',
    'teacher-a',
    'POST',
    draft({ visibility: 'public' }),
  );
  assert.equal(created.status, 201);
  const exam = await created.json();
  assert.equal((await call(`/teacher/exams/${exam.id}`, 'teacher-b')).status, 403);
  store.saveProfile('teacher-b', { ...user('teacher-b'), name: 'Other' });
  assert.equal((await call(`/teacher/exams/${exam.id}`, 'teacher-b')).status, 404);
  assert.equal(
    (await call(`/teacher/exams/${exam.id}/publish`, 'teacher-a', 'POST', {})).status,
    200,
  );
  assert.equal((await call('/exams/join', 'student', 'POST', { id: exam.id })).status, 200);
  const started = await (await call(`/exams/${exam.id}/attempts`, 'student', 'POST', {})).json();
  assert.equal(JSON.stringify(started).includes('explanation'), false);
  assert.equal(started.questions[0].correct, undefined);
  assert.equal((await call(`/exams/attempts/${started.id}`, 'teacher-b')).status, 404);
  const denied = await call('/teacher/exams', 'teacher-a');
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
