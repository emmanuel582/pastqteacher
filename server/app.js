import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fail, assertPublishable, validateQuestions } from './domain.js';
import { createBachs, verifyWebhook } from './bachs.js';

export function createApp({ store, config, authenticate, providerFetch = fetch }) {
  const app = express(),
    bachs = createBachs(config.bachs, providerFetch);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);
  const origins = [config.teacherOrigin, config.studentOrigin];
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
  });
  const route = (fn) => (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  const buckets = new Map();
  const limit = (prefix, count) => (req, res, next) => {
    const now = Date.now(),
      key = `${prefix}:${req.user?.id || req.ip}`;
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    if (buckets.size >= 20000 && !buckets.has(key))
      return res.status(429).json({ error: 'Please try again shortly.' });
    let b = buckets.get(key);
    if (!b || b.until < now) {
      b = { n: 0, until: now + 60000 };
      buckets.set(key, b);
    }
    if (++b.n > count)
      return res
        .status(429)
        .set('Retry-After', '60')
        .json({ error: 'Too many requests. Please try again shortly.' });
    next();
  };
  app.post(
    '/api/payments/bachs/webhook',
    limit('webhook', 300),
    express.raw({ type: 'application/json', limit: '256kb' }),
    route((req, res) => {
      const event = verifyWebhook(req.body, req.headers, config.bachs.webhookSecret);
      res.json(store.processPayment(event));
    }),
  );
  app.use(express.json({ limit: '30mb' }));
  const supabase =
    !authenticate && config.supabaseUrl && config.supabaseKey
      ? createClient(config.supabaseUrl, config.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  async function auth(req, _res, next) {
    try {
      const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
      if (!token) fail('Sign in to continue.', 401);
      const user = authenticate
        ? await authenticate(token)
        : supabase
          ? (await supabase.auth.getUser(token)).data.user
          : null;
      if (!user)
        fail(
          supabase || authenticate
            ? 'Your session expired. Sign in again.'
            : 'Authentication is not configured.',
          supabase || authenticate ? 401 : 503,
        );
      req.user = user;
      req.token = token;
      next();
    } catch (error) {
      next(error);
    }
  }
  const teacher = (req, _res, next) => {
    req.profile = store.profile(req.user.id);
    if (!req.profile)
      return next(
        Object.assign(new Error('Activate your teacher workspace first.'), { status: 403 }),
      );
    next();
  };
  app.get('/api/health', (_req, res) =>
    res.json({
      service: 'pastq-teacher',
      status: 'ok',
      authenticationConfigured: Boolean(supabase || authenticate),
      paymentsConfigured: bachs.configured,
    }),
  );
  app.get('/api/teacher/me', auth, (req, res) =>
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.user_metadata?.full_name || '',
      },
      profile: store.profile(req.user.id),
      payments: { configured: bachs.configured, environment: bachs.environment },
    }),
  );
  app.put(
    '/api/teacher/profile',
    auth,
    limit('profile', 20),
    route((req, res) => {
      const allowed = String(config.teacherIds || '')
        .split(',')
        .filter(Boolean);
      if (allowed.length && !allowed.includes(req.user.id))
        fail('This account has not been invited as a teacher.', 403);
      const old = store.profile(req.user.id) || {},
        name = String(req.body.name || '').trim(),
        organization = String(req.body.organization || '').trim(),
        logo = req.body.logo || null;
      if (
        !name ||
        name.length > 160 ||
        organization.length > 200 ||
        (logo && !/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(logo))
      )
        fail('Check your name, organization, and logo.');
      res.json(
        store.saveProfile(req.user.id, {
          ...old,
          id: req.user.id,
          name,
          organization,
          logo,
          email: req.user.email,
          createdAt: old.createdAt || new Date().toISOString(),
        }),
      );
    }),
  );
  app.use('/api/teacher', auth, teacher, limit('teacher', 240));
  async function upstream(req, suffix, init = {}) {
    const response = await providerFetch(`${config.pastqApi}${suffix}`, {
      ...init,
      headers: { Authorization: `Bearer ${req.token}`, ...init.headers },
      signal: AbortSignal.timeout(300000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      fail(
        typeof data.error === 'string'
          ? data.error
          : data.error?.message || 'PastQ could not process this request.',
        response.status,
      );
    return data;
  }
  const json = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Public library content only. Private uploads never enter this shared cache.
  const libraryCache = new Map();
  async function loadBundle(req, id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail('Invalid collection.');
    const cached = libraryCache.get(id);
    if (cached && Date.now() - cached.at < 60000) return cached.bundle;
    const bundle = await upstream(req, `/api/library/bundles/${encodeURIComponent(id)}`);
    libraryCache.delete(id);
    if (libraryCache.size >= 2) libraryCache.delete(libraryCache.keys().next().value);
    libraryCache.set(id, { at: Date.now(), bundle });
    return bundle;
  }
  async function embedFigures(req, questions) {
    const cache = new Map();
    for (const q of questions)
      for (const figure of q.figures || []) {
        if (!figure.url || figure.url.startsWith('data:image/')) continue;
        let url;
        try {
          url = new URL(figure.url, config.pastqApi);
        } catch {
          fail('A source figure has an invalid URL.');
        }
        const base = new URL(config.pastqApi);
        if (
          url.origin !== base.origin ||
          !/^\/api\/library\/figures\/[\w-]+\/[\w.-]+$/.test(url.pathname)
        )
          fail('This source figure cannot be imported securely.');
        if (!cache.has(url.href)) {
          const response = await providerFetch(url.href, {
            headers: { Authorization: `Bearer ${req.token}` },
            signal: AbortSignal.timeout(30000),
          });
          if (
            !response.ok ||
            !/^image\/(jpeg|png|webp)/.test(response.headers.get('content-type') || '')
          )
            fail('A source diagram could not be read. Please retry the import.', 502);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 10 * 1024 * 1024) fail('A source diagram exceeds the import limit.');
          cache.set(
            url.href,
            `data:${response.headers.get('content-type').split(';')[0]};base64,${bytes.toString('base64')}`,
          );
        }
        figure.url = cache.get(url.href);
      }
    return questions;
  }
  app.get('/api/teacher/exams', (req, res) => res.json({ items: store.list(req.user.id) }));
  app.post(
    '/api/teacher/exams',
    route((req, res) => res.status(201).json(store.create(req.user.id, req.body))),
  );
  app.get(
    '/api/teacher/exams/:id',
    route((req, res) => res.json(store.view(store.owned(req.user.id, req.params.id)))),
  );
  app.put(
    '/api/teacher/exams/:id',
    route((req, res) =>
      res.json(store.update(req.user.id, req.params.id, req.body, req.body.revision)),
    ),
  );
  app.post(
    '/api/teacher/exams/:id/publish',
    route(async (req, res) => {
      const exam = store.owned(req.user.id, req.params.id);
      assertPublishable(exam);
      let payment = {};
      if (exam.priceMinor) {
        if (!bachs.configured) fail('Configure Bachs before publishing a paid exam.', 503);
        if (!req.profile.connectedAccountId)
          fail('Connect your Bachs account in Workspace settings first.', 409);
        const account = await bachs.account(req.profile.connectedAccountId);
        const capability = exam.currency === 'NGN' ? 'ngn_card_collection' : 'card_collection';
        if (!account.is_active || account.capabilities?.[capability]?.status !== 'active')
          fail('Complete Bachs onboarding and enable collection for this currency.', 409);
        payment = { paymentAccount: account.id, productId: await bachs.product(exam, account.id) };
      }
      res.json(store.publish(req.user.id, exam.id, payment, exam.revision));
    }),
  );
  app.post(
    '/api/teacher/exams/:id/duplicate',
    route((req, res) => res.status(201).json(store.duplicate(req.user.id, req.params.id))),
  );
  app.post(
    '/api/teacher/exams/:id/rotate-code',
    route((req, res) => res.json(store.rotate(req.user.id, req.params.id))),
  );
  app.post(
    '/api/teacher/exams/:id/action',
    route((req, res) => res.json(store.changeStatus(req.user.id, req.params.id, req.body.action))),
  );
  app.get(
    '/api/teacher/exams/:id/analysis',
    route((req, res) => res.json(store.report(req.user.id, req.params.id))),
  );
  app.get(
    '/api/teacher/attempts/:id',
    route((req, res) => res.json(store.teacherAttempt(req.user.id, req.params.id))),
  );
  app.put(
    '/api/teacher/attempts/:id/grade',
    route((req, res) => res.json(store.manualGrade(req.user.id, req.params.id, req.body.scores))),
  );
  app.get('/api/teacher/uploads', (req, res) => res.json({ items: store.sources(req.user.id) }));
  app.post(
    '/api/teacher/uploads',
    limit('upload-create', 15),
    route(async (req, res) => {
      const session = await upstream(
        req,
        '/api/vision/sessions',
        json({
          name: String(req.body.name || 'Teacher paper').slice(0, 160),
          subjectHint: String(req.body.subject || '').slice(0, 200),
          libraryVisibility: 'private',
        }),
      );
      if (session.libraryVisibility !== 'private')
        fail(
          'Update the PastQ API to the matching release before uploading teacher papers. Private storage support is required.',
          503,
        );
      store.trackSource(req.user.id, session);
      res.status(201).json(session);
    }),
  );
  app.get(
    '/api/teacher/uploads/:id',
    route(async (req, res) => {
      store.source(req.user.id, req.params.id);
      res.json(await upstream(req, `/api/vision/sessions/${encodeURIComponent(req.params.id)}`));
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 10, fileSize: 25 * 1024 * 1024, fields: 5 },
  });
  app.post(
    '/api/teacher/uploads/:id/files',
    limit('upload-files', 20),
    upload.array('files', 10),
    route(async (req, res) => {
      store.source(req.user.id, req.params.id);
      if (!req.files?.length) fail('Choose a PDF or page images.');
      const pdf = req.files.some((f) => f.mimetype === 'application/pdf');
      if (pdf && req.files.length !== 1) fail('Upload one PDF at a time.');
      const form = new FormData();
      for (const f of req.files)
        form.append(
          pdf ? 'pdf' : 'images',
          new Blob([f.buffer], { type: f.mimetype }),
          f.originalname,
        );
      res.json(
        await upstream(
          req,
          `/api/vision/sessions/${encodeURIComponent(req.params.id)}/${pdf ? 'pdf' : 'pages'}`,
          { method: 'POST', body: form },
        ),
      );
    }),
  );
  app.post(
    '/api/teacher/uploads/:id/:action',
    route(async (req, res) => {
      store.source(req.user.id, req.params.id);
      if (!['start', 'resume'].includes(req.params.action)) fail('Unknown upload action.');
      res.json(
        await upstream(
          req,
          `/api/vision/sessions/${encodeURIComponent(req.params.id)}/${req.params.action}`,
          json({}),
        ),
      );
    }),
  );
  app.post(
    '/api/teacher/exams/:id/import-upload',
    route(async (req, res) => {
      const exam = store.owned(req.user.id, req.params.id);
      store.source(req.user.id, req.body.sourceId);
      const session = await upstream(
        req,
        `/api/vision/sessions/${encodeURIComponent(req.body.sourceId)}`,
      );
      if (!['completed', 'completed_with_errors'].includes(session.status))
        fail('Wait for extraction to finish before importing.', 409);
      const prepared = await embedFigures(
        req,
        (session.questions || []).map((q) => ({
          ...structuredClone(q),
          key: randomUUID(),
          correct:
            Number.isInteger(q.correct) && q.correct >= 0 && q.correct < (q.options || []).length
              ? q.correct
              : null,
          marks:
            typeof q.marks === 'number' && Number.isInteger(q.marks) && q.marks > 0 ? q.marks : 1,
        })),
      );
      const incoming = validateQuestions(prepared);
      res.json(
        store.update(
          req.user.id,
          exam.id,
          { ...exam, questions: [...exam.questions, ...incoming] },
          req.body.revision,
        ),
      );
    }),
  );
  app.get(
    '/api/teacher/library',
    route(async (req, res) => {
      const data = await upstream(req, '/api/library/bundles');
      res.json({ items: data.bundles || data.materials || [] });
    }),
  );
  app.get(
    '/api/teacher/library/:id',
    route(async (req, res) => {
      const bundle = await loadBundle(req, req.params.id);
      const search = String(req.query.search || '')
          .toLowerCase()
          .slice(0, 200),
        subject = String(req.query.subject || ''),
        offset = Math.max(0, Number.parseInt(req.query.offset) || 0),
        limit = Math.min(60, Math.max(1, Number.parseInt(req.query.limit) || 30));
      const rows = (bundle.questions || [])
        .map((q, sourceIndex) => ({ ...q, sourceIndex }))
        .filter(
          (q) =>
            (!subject || q.subject === subject) &&
            `${q.question} ${q.topic || ''} ${q.section || ''}`.toLowerCase().includes(search),
        );
      const questions = await embedFigures(
        req,
        structuredClone(rows.slice(offset, offset + limit)),
      );
      const references = new Set(
        questions.flatMap((q) =>
          [q.questionHtml, ...(q.optionsHtml || []), q.explanationHtml, q.answerHtml].flatMap(
            (html) =>
              [...String(html || '').matchAll(/pastq-asset:([a-f0-9]{64})/g)].map((m) => m[1]),
          ),
        ),
      );
      res.json({
        id: bundle.id,
        title: bundle.title || bundle.name,
        questions,
        total: rows.length,
        offset,
        limit,
        subjects: [
          ...new Set((bundle.questions || []).map((q) => q.subject).filter(Boolean)),
        ].sort(),
        assets: Object.fromEntries(
          [...references]
            .filter((key) => bundle.assets?.[key])
            .map((key) => [key, bundle.assets[key]]),
        ),
      });
    }),
  );
  app.post(
    '/api/teacher/exams/:id/import-library',
    route(async (req, res) => {
      const exam = store.owned(req.user.id, req.params.id),
        bundle = await loadBundle(req, req.body.bundleId);
      if (
        !Array.isArray(req.body.indexes) ||
        !req.body.indexes.length ||
        req.body.indexes.length > 1000 ||
        new Set(req.body.indexes).size !== req.body.indexes.length
      )
        fail('Select unique questions.');
      const questions = await embedFigures(
        req,
        req.body.indexes.map((i) => {
          if (!Number.isInteger(i) || !bundle.questions?.[i]) fail('Question not found.');
          const q = structuredClone(bundle.questions[i]);
          return {
            ...q,
            key: randomUUID(),
            correct:
              Number.isInteger(q.correct) && q.correct >= 0 && q.correct < (q.options || []).length
                ? q.correct
                : null,
            marks: 1,
          };
        }),
      );
      const references = new Set(
        questions.flatMap((q) =>
          [q.questionHtml, ...(q.optionsHtml || []), q.explanationHtml, q.answerHtml].flatMap(
            (html) =>
              [...String(html || '').matchAll(/pastq-asset:([a-f0-9]{64})/g)].map((m) => m[1]),
          ),
        ),
      );
      const assets = Object.fromEntries(
        [...references]
          .filter((key) => bundle.assets?.[key])
          .map((key) => [key, bundle.assets[key]]),
      );
      const updated = store.update(
        req.user.id,
        exam.id,
        { ...exam, questions: [...exam.questions, ...questions] },
        req.body.revision,
      );
      store.setAssets(req.user.id, exam.id, assets);
      res.json(store.view(store.getExam(updated.id)));
    }),
  );
  app.get(
    '/api/teacher/exams/:id/recommendations',
    route(async (req, res) => {
      const report = store.report(req.user.id, req.params.id),
        weak = report.topics.filter((t) => t.accuracy !== null && t.accuracy < 65);
      if (!weak.length) return res.json({ topics: [], items: [] });
      const data = await upstream(req, '/api/library/bundles'),
        items = data.bundles || data.materials || [];
      const normalize = (value) =>
        String(value)
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const candidates = items
        .filter((b) => {
          const words = normalize(
            [b.title, b.name, ...(b.libraryStats?.subjects || b.subjects || [])].join(' '),
          );
          return weak.some((t) => words.includes(normalize(t.subject)));
        })
        .slice(0, 6);
      const suggestions = [];
      for (const b of candidates) {
        const bundle = await loadBundle(req, b.id);
        const matches = weak
          .map((t) => {
            const needle = normalize(t.topic);
            const hits = (bundle.questions || []).filter(
              (q) =>
                normalize(q.subject) === normalize(t.subject) &&
                needle &&
                needle !== 'unsectioned' &&
                (normalize(q.topic || q.section).includes(needle) ||
                  normalize(q.question).includes(needle)),
            );
            return { topic: t.topic, count: hits.length };
          })
          .filter((t) => t.count);
        if (matches.length)
          suggestions.push({
            ...b,
            matchedTopics: matches.map((t) => t.topic),
            matchingQuestions: matches.reduce((n, t) => n + t.count, 0),
            searchTopic: matches[0].topic,
            relevance: matches.length,
          });
      }
      res.json({ topics: weak, items: suggestions.sort((a, b) => b.relevance - a.relevance) });
    }),
  );
  app.post(
    '/api/teacher/payments/connect',
    limit('bachs-connect', 5),
    route(async (req, res) => {
      const { accountId } = await bachs.onboard(req.profile, config.teacherOrigin);
      store.saveProfile(req.user.id, { ...req.profile, connectedAccountId: accountId });
      const link = await bachs.onboardingLink(accountId, config.teacherOrigin);
      res.json({ url: link.url });
    }),
  );
  app.get(
    '/api/teacher/payments',
    route(async (req, res) => {
      res.json({
        configured: bachs.configured,
        environment: bachs.environment,
        account:
          req.profile.connectedAccountId && bachs.configured
            ? await bachs.account(req.profile.connectedAccountId)
            : null,
        orders: store.revenue(req.user.id),
      });
    }),
  );
  app.post(
    '/api/teacher/logo',
    upload.single('logo'),
    route(async (req, res) => {
      if (!req.file || req.file.size > 5 * 1024 * 1024) fail('Choose a logo smaller than 5 MB.');
      const buffer = await sharp(req.file.buffer, { limitInputPixels: 25000000, animated: false })
        .rotate()
        .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      const id = randomUUID(),
        dir = path.join(config.dataDir, 'media');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${id}.webp`), buffer);
      res.json({ logo: `/api/media/${id}.webp` });
    }),
  );
  app.get(
    '/api/media/:file',
    route((req, res) => {
      if (!/^[a-f0-9-]{36}\.webp$/.test(req.params.file)) fail('Image not found.', 404);
      res.sendFile(path.join(config.dataDir, 'media', req.params.file));
    }),
  );
  // Student integration contract. No changes to the existing student application.
  app.use('/api/exams', auth, limit('exams', 120));
  app.get('/api/exams', (req, res) =>
    res.json({
      sessions: store.discover(req.user.id, String(req.query.search || '')),
      joined: store.joined(req.user.id),
    }),
  );
  app.post(
    '/api/exams/resolve',
    limit('invite', 8),
    route((req, res) => {
      const exam = store.resolve(req.body.id, req.body.code, req.user.id);
      res.json(store.publicExam(exam, req.user.id));
    }),
  );
  app.post(
    '/api/exams/join',
    limit('join', 8),
    route(async (req, res) => {
      const exam = store.resolve(req.body.id, req.body.code, req.user.id);
      store.assertOpen(exam);
      if (store.member(exam.id, req.user.id))
        return res.json({ joined: true, exam: store.publicExam(exam, req.user.id) });
      if (exam.priceMinor) {
        if (!bachs.configured) fail('Payments are currently unavailable.', 503);
        const order = store.createOrder(exam, req.user);
        const checkout = await bachs.checkout(order, config.studentOrigin);
        store.checkout(order.id, checkout.id, checkout.url);
        return res
          .status(402)
          .json({ paymentRequired: true, orderId: order.id, checkoutUrl: checkout.url });
      }
      store.enroll(exam.id, req.user);
      res.json({ joined: true, exam: store.publicExam(exam, req.user.id) });
    }),
  );
  app.get(
    '/api/exams/orders/:id',
    route((req, res) => {
      const order = store.order(req.params.id);
      if (!order || order.userId !== req.user.id) fail('Order not found.', 404);
      res.json({ id: order.id, examId: order.examId, status: order.status });
    }),
  );
  app.post(
    '/api/exams/:id/attempts',
    route((req, res) => res.json(store.studentAttempt(store.start(req.params.id, req.user.id)))),
  );
  app.get(
    '/api/exams/attempts/:id',
    route((req, res) => {
      const a = store.attempt(req.params.id);
      if (a.userId !== req.user.id) fail('Attempt not found.', 404);
      res.json(store.studentAttempt(a));
    }),
  );
  app.put(
    '/api/exams/attempts/:id/answers',
    route((req, res) =>
      res.json(store.studentAttempt(store.saveAnswers(req.params.id, req.user.id, req.body))),
    ),
  );
  app.post(
    '/api/exams/attempts/:id/submit',
    route((req, res) => res.json(store.studentAttempt(store.submit(req.params.id, req.user.id)))),
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(config.staticDir, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError)
      return res.status(400).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'A file is too large (25 MB maximum).'
            : 'Check the selected files.',
      });
    console.error('[teacher]', error.message);
    res
      .status(error.status || 500)
      .json({ error: error.status ? error.message : 'The request failed. Please try again.' });
  });
  return app;
}
