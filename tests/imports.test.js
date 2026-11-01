import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { defaults, safeQuestions, visibleAssets } from '../server/domain.js';
test('unreleased solution images are excluded, including when they share an exam asset map', () => {
  const stem = 'a'.repeat(64),
    solution = 'b'.repeat(64);
  const questions = [
    {
      questionHtml: `<img src="pastq-asset:${stem}">`,
      options: [],
      correct: null,
      explanationHtml: `<img src="pastq-asset:${solution}">`,
      answerHtml: `<img src="pastq-asset:${solution}">`,
      answerText: 'secret',
    },
  ];
  const assets = {
    [stem]: { mime: 'image/png', data: 'stem' },
    [solution]: { mime: 'image/png', data: 'secret' },
  };
  assert.deepEqual(Object.keys(visibleAssets(safeQuestions(questions), assets)), [stem]);
  assert.equal(JSON.stringify(safeQuestions(questions)).includes('secret'), false);
  assert.deepEqual(Object.keys(visibleAssets(safeQuestions(questions, true), assets)), [
    stem,
    solution,
  ]);
});
test('library paging preserves original question indexes and private extraction imports embed protected figures', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastq-teacher-imports-')),
    store = createStore(dir, 'imports-secret-with-more-than-32-characters');
  store.saveProfile('teacher', { id: 'teacher', name: 'Ada' });
  const questions = Array.from({ length: 70 }, (_, i) => ({
    question: `Question ${i}`,
    subject: 'Chemistry',
    topic: i % 2 ? 'Stoichiometry' : 'Bonding',
    options: ['One', 'Two'],
    correct: 0,
    marks: 1,
  }));
  let modern = false,
    sawPrivate = false;
  const providerFetch = async (url, init) => {
    if (url.endsWith('/api/vision/sessions')) {
      sawPrivate = JSON.parse(init.body).libraryVisibility === 'private';
      return Response.json({
        id: 'source-teacher',
        name: 'Paper',
        ...(modern ? { libraryVisibility: 'private' } : {}),
      });
    }
    if (url.endsWith('/api/vision/sessions/source-teacher'))
      return Response.json({
        status: 'completed',
        questions: [
          {
            ...questions[0],
            figures: [{ url: '/api/library/figures/source-teacher/p000000-f1-123456abcdef.jpg' }],
          },
        ],
      });
    if (url.includes('/api/library/figures/')) {
      assert.equal(init.headers.Authorization, 'Bearer teacher');
      return new Response(Buffer.from([255, 216, 255, 217]), {
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
    if (url.includes('/api/library/bundles/library'))
      return Response.json({ id: 'library', title: 'Chemistry', questions, assets: {} });
    return Response.json({
      bundles: [{ id: 'library', title: 'Chemistry', subjects: ['Chemistry'] }],
    });
  };
  const app = createApp({
    store,
    config: {
      dataDir: dir,
      teacherOrigin: 'http://teacher.test',
      studentOrigin: 'http://students.test',
      pastqApi: 'https://api.test',
      bachs: {},
    },
    authenticate: async (token) =>
      token === 'teacher' ? { id: 'teacher', email: 'ada@example.test' } : null,
    providerFetch,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.close();
    if (
      !path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'pastq-teacher-imports-')
    )
      throw new Error('Unexpected cleanup path');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const call = (suffix, method = 'GET', body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/teacher${suffix}`, {
      method,
      headers: { Authorization: 'Bearer teacher', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call('/uploads', 'POST', { name: 'Private' })).status, 503);
  assert.equal(sawPrivate, true);
  assert.equal(store.sources('teacher').length, 0);
  modern = true;
  assert.equal((await call('/uploads', 'POST', { name: 'Private' })).status, 201);
  const page = await (
    await call('/library/library?subject=Chemistry&search=Stoichiometry&offset=10&limit=5')
  ).json();
  assert.equal(page.total, 35);
  assert.equal(page.questions.length, 5);
  assert.equal(page.questions[0].sourceIndex, 21);
  const exam = store.create('teacher', {
    title: 'Practice',
    visibility: 'private',
    priceMinor: 0,
    currency: 'NGN',
    settings: defaults(),
    questions: [],
  });
  const imported = await (
    await call(`/exams/${exam.id}/import-upload`, 'POST', {
      sourceId: 'source-teacher',
      revision: 1,
    })
  ).json();
  assert.match(imported.questions[0].figures[0].url, /^data:image\/jpeg;base64,/);
  const libraryImport = await (
    await call(`/exams/${exam.id}/import-library`, 'POST', {
      bundleId: 'library',
      indexes: [21],
      revision: imported.revision,
    })
  ).json();
  assert.equal(libraryImport.questions[1].question, 'Question 21');
});
