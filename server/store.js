import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  fail,
  validateExam,
  assertPublishable,
  attemptQuestions,
  grade,
  analytics,
  released,
  safeQuestions,
  visibleAssets,
} from './domain.js';

export function createStore(directory, secret) {
  if (!secret || secret.length < 32)
    throw new Error('TEACHER_STORAGE_SECRET must contain at least 32 characters.');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'teacher.db'),
    db = new DatabaseSync(file);
  if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exams(id TEXT PRIMARY KEY,owner TEXT NOT NULL,visibility TEXT NOT NULL,status TEXT NOT NULL,code_hash TEXT UNIQUE,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS exams_owner ON exams(owner,status);
    CREATE TABLE IF NOT EXISTS members(exam_id TEXT NOT NULL REFERENCES exams(id),user_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(exam_id,user_id));
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,exam_id TEXT NOT NULL REFERENCES exams(id),user_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attempts_exam ON attempts(exam_id,user_id,status);
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,exam_id TEXT NOT NULL,user_id TEXT NOT NULL,checkout_id TEXT UNIQUE,status TEXT NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,owner TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const key = createHash('sha256').update(secret).digest();
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const seal = (value) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv),
      encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  };
  const unseal = (value) => {
    const b = Buffer.from(value, 'base64url'),
      decipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8');
  };
  const parse = (row) => (row ? JSON.parse(row.data) : null);
  const all = (sql, ...params) =>
    db
      .prepare(sql)
      .all(...params)
      .map(parse);
  const one = (sql, ...params) => parse(db.prepare(sql).get(...params));
  const transaction = (work) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = work();
      db.exec('COMMIT');
      return out;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const log = (owner, action, target) =>
    db
      .prepare('INSERT INTO audit VALUES(?,?,?,?,?)')
      .run(randomUUID(), owner, action, target, new Date().toISOString());
  function saveExam(exam) {
    db.prepare(
      'INSERT INTO exams VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET visibility=excluded.visibility,status=excluded.status,code_hash=excluded.code_hash,data=excluded.data',
    ).run(
      exam.id,
      exam.owner,
      exam.visibility,
      exam.status,
      exam.codeHash || null,
      JSON.stringify(exam),
    );
    return exam;
  }
  function getExam(id) {
    return one('SELECT data FROM exams WHERE id=?', id);
  }
  function owned(owner, id) {
    const exam = getExam(id);
    if (!exam || exam.owner !== owner) fail('Exam not found.', 404);
    return exam;
  }
  function view(exam) {
    const { owner, codeHash, encryptedCode, productId, paymentAccount, ...data } = exam;
    return { ...data, inviteCode: encryptedCode ? unseal(encryptedCode) : null };
  }
  function summary(exam) {
    const { questions, assets, ...data } = view(exam);
    return {
      ...data,
      questionCount: questions.length,
      enrolled: db.prepare('SELECT count(*) n FROM members WHERE exam_id=?').get(exam.id).n,
      completed: db
        .prepare("SELECT count(*) n FROM attempts WHERE exam_id=? AND status='submitted'")
        .get(exam.id).n,
    };
  }
  function saveAttempt(a) {
    db.prepare(
      'INSERT INTO attempts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data',
    ).run(a.id, a.examId, a.userId, a.status, JSON.stringify(a));
    return a;
  }
  function finalize(a, now = Date.now()) {
    if (a.status === 'submitted') return a;
    a.status = 'submitted';
    a.submittedAt = new Date(Math.min(now, Date.parse(a.deadline))).toISOString();
    a.durationSeconds = Math.max(
      0,
      Math.round((Date.parse(a.submittedAt) - Date.parse(a.startedAt)) / 1000),
    );
    a.result = grade(a.questions, a.answers, a.settings, a.manual);
    return saveAttempt(a);
  }
  function expire(examId) {
    const rows = all("SELECT data FROM attempts WHERE exam_id=? AND status='in_progress'", examId);
    for (const a of rows) if (Date.parse(a.deadline) <= Date.now()) finalize(a);
  }
  function member(examId, userId) {
    return one('SELECT data FROM members WHERE exam_id=? AND user_id=?', examId, userId);
  }
  function publicExam(exam, userId) {
    const p = api.profile(exam.owner);
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      subject: exam.subject,
      logo: exam.logo || p?.logo || null,
      teacher: p?.name || 'Teacher',
      organization: p?.organization || '',
      visibility: exam.visibility,
      status: exam.status,
      priceMinor: exam.priceMinor,
      currency: exam.currency,
      questionCount: exam.questions.length,
      durationMinutes: exam.settings.durationMinutes,
      startsAt: exam.settings.startsAt,
      endsAt: exam.settings.endsAt,
      maxAttempts: exam.settings.maxAttempts,
      instructions: exam.settings.instructions,
      passMark: exam.settings.passMark,
      joined: Boolean(userId && member(exam.id, userId)),
    };
  }
  function assertOpen(exam, starting = false) {
    if (!exam || exam.status !== 'open') fail('This exam is not accepting entries.', 409);
    if (exam.settings.endsAt && Date.parse(exam.settings.endsAt) <= Date.now())
      fail('This exam has ended.', 409);
    if (starting && exam.settings.startsAt && Date.parse(exam.settings.startsAt) > Date.now())
      fail('This exam has not started yet.', 409);
  }
  const api = {
    db,
    close: () => db.close(),
    transaction,
    log,
    getExam,
    owned,
    view,
    summary,
    publicExam,
    assertOpen,
    profile: (id) => one('SELECT data FROM profiles WHERE id=?', id),
    saveProfile(id, input) {
      db.prepare(
        'INSERT INTO profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      ).run(id, JSON.stringify(input));
      return input;
    },
    list: (owner) =>
      all('SELECT data FROM exams WHERE owner=? ORDER BY rowid DESC', owner).map(summary),
    create(owner, input) {
      const clean = validateExam(input),
        now = new Date().toISOString();
      const exam = {
        ...clean,
        id: randomUUID(),
        owner,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        revision: 1,
        resultsReleased: false,
        assets: {},
      };
      saveExam(exam);
      log(owner, 'Created exam', exam.id);
      return view(exam);
    },
    update(owner, id, input, revision) {
      return transaction(() => {
        const exam = owned(owner, id);
        if (exam.status !== 'draft')
          fail('Published exam content is locked. Duplicate it to create a new version.', 409);
        if (revision !== exam.revision)
          fail('This exam changed in another tab. Reload before saving.', 409);
        const clean = validateExam(input);
        saveExam({
          ...exam,
          ...clean,
          updatedAt: new Date().toISOString(),
          revision: exam.revision + 1,
        });
        log(owner, 'Saved draft', id);
        return view(getExam(id));
      });
    },
    setAssets(owner, id, assets) {
      const exam = owned(owner, id);
      if (exam.status !== 'draft') fail('Only drafts can receive questions.', 409);
      if (!assets || typeof assets !== 'object' || Array.isArray(assets))
        fail('Invalid source assets.');
      for (const [hash, a] of Object.entries(assets))
        if (
          !/^[a-f0-9]{64}$/.test(hash) ||
          !a ||
          !/^image\/(png|jpeg|gif|webp)$/.test(a.mime) ||
          typeof a.data !== 'string' ||
          a.data.length > 15000000
        )
          fail('Invalid source image.');
      saveExam({ ...exam, assets: { ...exam.assets, ...assets } });
    },
    publish(owner, id, payment = {}, revision) {
      return transaction(() => {
        const exam = owned(owner, id);
        if (exam.status !== 'draft') fail('This exam is already published.', 409);
        if (revision !== undefined && exam.revision !== revision)
          fail('The draft changed while publishing. Review it and publish again.', 409);
        assertPublishable(exam);
        if (exam.priceMinor && (!payment.productId || !payment.paymentAccount))
          fail('Connect payments before publishing a paid exam.', 409);
        Object.assign(exam, payment, {
          status: 'open',
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        if (exam.visibility === 'private') {
          const code = randomBytes(8).toString('hex').toUpperCase();
          exam.encryptedCode = seal(code);
          exam.codeHash = hash(code);
        }
        saveExam(exam);
        log(owner, 'Published exam', id);
        return view(exam);
      });
    },
    changeStatus(owner, id, action) {
      const exam = owned(owner, id);
      if (action === 'release') {
        if (exam.status === 'draft') fail('Publish this exam first.', 409);
        exam.resultsReleased = true;
      } else {
        const next = { close: 'closed', reopen: 'open', archive: 'archived' }[action];
        if (!next || exam.status === 'draft' || exam.status === 'archived')
          fail('Invalid exam transition.', 409);
        if (
          action === 'reopen' &&
          exam.settings.endsAt &&
          Date.parse(exam.settings.endsAt) <= Date.now()
        )
          fail('This exam has passed its closing date. Duplicate it to run another session.', 409);
        exam.status = next;
      }
      saveExam(exam);
      log(owner, action, id);
      return view(exam);
    },
    rotate(owner, id) {
      const exam = owned(owner, id);
      if (exam.visibility !== 'private' || exam.status !== 'open')
        fail('Only an open private exam has an invite code.');
      const code = randomBytes(8).toString('hex').toUpperCase();
      exam.encryptedCode = seal(code);
      exam.codeHash = hash(code);
      saveExam(exam);
      log(owner, 'Rotated invite', id);
      return { inviteCode: code };
    },
    duplicate(owner, id) {
      const source = owned(owner, id);
      const draft = api.create(owner, { ...source, title: `${source.title.slice(0, 140)} · copy` });
      api.setAssets(owner, draft.id, source.assets || {});
      return view(getExam(draft.id));
    },
    discover: (userId, search = '') =>
      all("SELECT data FROM exams WHERE visibility='public' AND status='open'")
        .filter(
          (e) =>
            (!e.settings.endsAt || Date.parse(e.settings.endsAt) > Date.now()) &&
            `${e.title} ${e.subject}`.toLowerCase().includes(search.toLowerCase().slice(0, 150)),
        )
        .map((e) => publicExam(e, userId)),
    joined: (userId) =>
      all(
        'SELECT e.data FROM exams e JOIN members m ON m.exam_id=e.id WHERE m.user_id=? ORDER BY m.rowid DESC',
        userId,
      ).map((e) => publicExam(e, userId)),
    resolve(id, code, userId) {
      let exam = id ? getExam(id) : null;
      if (code) {
        const normalized = String(code).toUpperCase().replace(/[\s-]/g, '');
        if (!/^[A-F0-9]{16}$/.test(normalized)) fail('Enter the 16-character exam code.');
        exam = one('SELECT data FROM exams WHERE code_hash=?', hash(normalized));
      }
      if (
        !exam ||
        exam.status === 'draft' ||
        exam.status === 'archived' ||
        (exam.visibility === 'private' && !code && !member(exam.id, userId))
      )
        fail('Exam not found. Check the invite code.', 404);
      return exam;
    },
    enroll(examId, user, paid = false) {
      return transaction(() => {
        const exam = getExam(examId);
        assertOpen(exam);
        const existing = member(examId, user.id);
        if (existing) return existing;
        if (exam.priceMinor && !paid) fail('Payment is required before joining this exam.', 402);
        if (
          exam.settings.capacity &&
          db.prepare('SELECT count(*) n FROM members WHERE exam_id=?').get(examId).n >=
            exam.settings.capacity
        )
          fail('This exam has reached its seat limit.', 409);
        const entry = {
          userId: user.id,
          name: String(
            user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student',
          ).slice(0, 160),
          email: user.email || '',
          joinedAt: new Date().toISOString(),
          paid,
        };
        db.prepare('INSERT INTO members VALUES(?,?,?)').run(examId, user.id, JSON.stringify(entry));
        return entry;
      });
    },
    member,
    start(examId, userId) {
      return transaction(() => {
        const exam = getExam(examId);
        assertOpen(exam, true);
        if (!member(examId, userId)) fail('Join this exam first.', 403);
        expire(examId);
        const rows = all(
          'SELECT data FROM attempts WHERE exam_id=? AND user_id=? ORDER BY rowid',
          examId,
          userId,
        );
        const active = rows.find((a) => a.status === 'in_progress');
        if (active) return active;
        if (rows.length >= exam.settings.maxAttempts) fail('You have used all your attempts.', 409);
        const now = Date.now(),
          deadline = Math.min(
            now + exam.settings.durationMinutes * 60000,
            exam.settings.endsAt ? Date.parse(exam.settings.endsAt) : Infinity,
          );
        return saveAttempt({
          id: randomUUID(),
          examId,
          userId,
          status: 'in_progress',
          number: rows.length + 1,
          startedAt: new Date(now).toISOString(),
          deadline: new Date(deadline).toISOString(),
          questions: attemptQuestions(exam),
          settings: exam.settings,
          answers: {},
          manual: {},
          timeByQuestion: {},
          focusChanges: 0,
          revision: 1,
        });
      });
    },
    attempt(id) {
      const a = one('SELECT data FROM attempts WHERE id=?', id);
      if (!a) fail('Attempt not found.', 404);
      if (a.status === 'in_progress' && Date.parse(a.deadline) <= Date.now()) return finalize(a);
      return a;
    },
    saveAnswers(id, userId, input) {
      return transaction(() => {
        const a = api.attempt(id);
        if (a.userId !== userId) fail('Attempt not found.', 404);
        if (a.status !== 'in_progress') fail('This attempt is already submitted.', 409);
        if (input.revision !== a.revision)
          fail('A newer answer save exists. Reload this attempt.', 409);
        if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers))
          fail('Provide answers keyed by question.');
        const keys = new Map(a.questions.map((q) => [q.key, q]));
        for (const [key, answer] of Object.entries(input.answers)) {
          const q = keys.get(key);
          if (!q) fail('Unknown question.');
          if (q.type === 'theory') {
            if (answer !== null && (typeof answer !== 'string' || answer.length > 30000))
              fail('Invalid written response.');
          } else if (
            answer !== null &&
            (!Number.isInteger(answer) || answer < 0 || answer >= q.options.length)
          )
            fail('Invalid choice.');
          a.answers[key] = answer;
        }
        a.revision++;
        return saveAttempt(a);
      });
    },
    submit(id, userId) {
      return transaction(() => {
        const a = api.attempt(id);
        if (a.userId !== userId) fail('Attempt not found.', 404);
        return finalize(a);
      });
    },
    studentAttempt(a) {
      const exam = getExam(a.examId),
        canSee = a.status === 'submitted' && released(exam) && !a.result.pending;
      const questions = safeQuestions(a.questions, canSee && exam.settings.showSolutions);
      return {
        id: a.id,
        examId: a.examId,
        status: a.status,
        number: a.number,
        startedAt: a.startedAt,
        deadline: a.deadline,
        revision: a.revision,
        answers: a.answers,
        questions,
        assets: visibleAssets(questions, exam.assets),
        ...(canSee ? { result: a.result } : {}),
        pendingGrading: a.result?.pending || 0,
        resultReleased: canSee,
      };
    },
    report(owner, id) {
      const exam = owned(owner, id);
      expire(id);
      return analytics(
        exam,
        all('SELECT data FROM attempts WHERE exam_id=? ORDER BY rowid', id),
        all('SELECT data FROM members WHERE exam_id=? ORDER BY rowid', id),
      );
    },
    teacherAttempt(owner, id) {
      const a = api.attempt(id);
      const exam = owned(owner, a.examId);
      return { ...a, assets: exam.assets };
    },
    manualGrade(owner, id, scores) {
      return transaction(() => {
        const a = api.teacherAttempt(owner, id);
        if (a.status !== 'submitted') fail('Wait until the student submits.', 409);
        if (!scores || typeof scores !== 'object' || Array.isArray(scores))
          fail('Provide written scores.');
        for (const [key, score] of Object.entries(scores)) {
          const q = a.questions.find((q) => q.key === key && q.type === 'theory');
          if (!q || !Number.isInteger(score) || score < 0 || score > q.marks)
            fail('Check the awarded marks.');
          a.manual[key] = score;
        }
        a.result = grade(a.questions, a.answers, a.settings, a.manual);
        log(owner, 'Graded written responses', id);
        delete a.assets;
        return saveAttempt(a);
      });
    },
    source(owner, id) {
      const source = one('SELECT data FROM sources WHERE id=? AND owner=?', id, owner);
      if (!source) fail('Upload not found.', 404);
      return source;
    },
    sources: (owner) => all('SELECT data FROM sources WHERE owner=? ORDER BY rowid DESC', owner),
    trackSource(owner, source) {
      db.prepare('INSERT INTO sources VALUES(?,?,?)').run(
        source.id,
        owner,
        JSON.stringify({ id: source.id, name: source.name, createdAt: new Date().toISOString() }),
      );
    },
    createOrder(exam, user) {
      const id = randomUUID(),
        order = {
          id,
          examId: exam.id,
          userId: user.id,
          name: user.user_metadata?.full_name || '',
          email: user.email,
          amount: exam.priceMinor,
          currency: exam.currency,
          account: exam.paymentAccount,
          productId: exam.productId,
          createdAt: new Date().toISOString(),
        };
      db.prepare('INSERT INTO orders VALUES(?,?,?,NULL,?,?)').run(
        id,
        exam.id,
        user.id,
        'pending',
        JSON.stringify(order),
      );
      return order;
    },
    checkout(id, checkoutId, url) {
      db.prepare(
        "UPDATE orders SET checkout_id=?,data=json_set(data,'$.checkoutId',?,'$.url',?) WHERE id=?",
      ).run(checkoutId, checkoutId, url, id);
    },
    order: (id) => {
      const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      return row ? { ...parse(row), status: row.status } : null;
    },
    processPayment(event) {
      return transaction(() => {
        if (db.prepare('SELECT 1 FROM webhook_events WHERE id=?').get(event.id))
          return { duplicate: true };
        const d = event.data || {};
        if (event.type === 'collection.succeeded') {
          const row = db.prepare('SELECT * FROM orders WHERE checkout_id=?').get(d.checkout_id);
          if (!row) fail('Checkout not registered yet; retry delivery.', 409);
          const order = parse(row);
          if (
            (event.account || event.organization_id) !== order.account ||
            d.currency !== order.currency ||
            Math.round(Number(d.amount) * 100) !== order.amount ||
            d.reference !== order.id ||
            d.status !== 'SUCCEEDED'
          )
            fail('Payment does not match the exam order.', 400);
          if (row.status !== 'paid') {
            const exam = getExam(order.examId);
            const entry = {
              userId: order.userId,
              name: order.name || order.email.split('@')[0],
              email: order.email,
              joinedAt: new Date().toISOString(),
              paid: true,
            };
            db.prepare('INSERT OR IGNORE INTO members VALUES(?,?,?)').run(
              exam.id,
              order.userId,
              JSON.stringify(entry),
            );
            db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(order.id);
          }
        }
        db.prepare('INSERT INTO webhook_events VALUES(?,?)').run(
          event.id,
          new Date().toISOString(),
        );
        return { received: true };
      });
    },
    revenue: (owner) =>
      db
        .prepare(
          'SELECT o.status,o.data FROM orders o JOIN exams e ON e.id=o.exam_id WHERE e.owner=? ORDER BY o.rowid DESC',
        )
        .all(owner)
        .map((row) => ({ ...parse(row), status: row.status })),
  };
  return api;
}
