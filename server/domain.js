import { randomUUID, randomInt } from 'node:crypto';

export const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, max, label, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    fail(`Check ${label}.`);
  return value.trim();
};
const integer = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(`Check ${label} (${min}–${max}).`);
  return value;
};
export const defaults = () => ({
  durationMinutes: 30,
  maxAttempts: 1,
  passMark: 50,
  negativeMark: 0,
  shuffleQuestions: true,
  shuffleOptions: false,
  resultRelease: 'immediate',
  showSolutions: false,
  startsAt: null,
  endsAt: null,
  capacity: 0,
  instructions: '',
});
export function validateSettings(input = {}) {
  const value = { ...defaults(), ...input };
  integer(value.durationMinutes, 1, 360, 'duration');
  integer(value.maxAttempts, 1, 20, 'attempt limit');
  integer(value.passMark, 0, 100, 'pass mark');
  integer(value.capacity, 0, 100000, 'seat limit');
  if (![0, 0.25, 0.5, 1].includes(value.negativeMark))
    fail('Choose a valid penalty for a wrong answer.');
  for (const key of ['shuffleQuestions', 'shuffleOptions', 'showSolutions'])
    if (typeof value[key] !== 'boolean') fail(`Check ${key}.`);
  if (!['immediate', 'after_close', 'manual'].includes(value.resultRelease))
    fail('Choose when to release results.');
  for (const key of ['startsAt', 'endsAt'])
    if (
      value[key] !== null &&
      (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key])))
    )
      fail('Check the exam dates.');
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt))
    fail('The closing time must be after the opening time.');
  value.instructions = text(value.instructions, 5000, 'instructions');
  return Object.fromEntries(Object.keys(defaults()).map((key) => [key, value[key]]));
}
export function validateQuestions(input) {
  if (!Array.isArray(input) || input.length > 1000)
    fail('An exam can contain up to 1,000 questions.');
  const keys = new Set();
  return input.map((raw, index) => {
    const question = text(raw.question, 50000, `question ${index + 1}`, true);
    const type = ['theory', 'short_answer'].includes(raw.type) ? 'theory' : 'mcq';
    const options = type === 'theory' ? [] : raw.options;
    if (!Array.isArray(options) || (type === 'mcq' && (options.length < 2 || options.length > 12)))
      fail(`Check the options for question ${index + 1}.`);
    const correct =
      type === 'theory' || raw.correct == null
        ? null
        : integer(raw.correct, 0, options.length - 1, 'answer key');
    const key =
      typeof raw.key === 'string' && /^[\w:.-]{1,200}$/.test(raw.key) ? raw.key : randomUUID();
    if (keys.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key))
      fail('Each question must have a unique, valid identity.');
    keys.add(key);
    // Rich source assets remain in the snapshot. The browser renderer sanitizes HTML.
    const result = {
      key,
      question,
      type,
      options: options.map((option) => text(option, 20000, 'option', true)),
      correct,
      subject: text(raw.subject || 'General', 200, 'subject'),
      topic: text(raw.topic || raw.section || 'Unsectioned', 200, 'topic'),
      explanation: text(raw.explanation || '', 50000, 'explanation'),
      answerText: text(raw.answerText || '', 50000, 'source answer'),
      marks: integer(raw.marks ?? 1, 1, 100, 'marks'),
    };
    for (const field of ['questionHtml', 'explanationHtml', 'answerHtml', 'passage'])
      if (typeof raw[field] === 'string') result[field] = text(raw[field], 150000, field);
    if (Array.isArray(raw.optionsHtml) && raw.optionsHtml.length === options.length)
      result.optionsHtml = raw.optionsHtml.map((html) => text(html, 150000, 'option formatting'));
    if (Array.isArray(raw.figures))
      result.figures = raw.figures
        .slice(0, 20)
        .filter((f) => f && typeof f.url === 'string')
        .map((f) => ({
          url: f.url.slice(0, 1500000),
          caption: String(f.caption || '').slice(0, 500),
          description: String(f.description || '').slice(0, 500),
        }));
    return result;
  });
}
export function validateExam(input) {
  if (!['public', 'private'].includes(input.visibility)) fail('Choose public or private access.');
  if (!['NGN', 'USD'].includes(input.currency)) fail('Choose NGN or USD.');
  integer(input.priceMinor, 0, 100000000, 'price');
  if (input.priceMinor > 0 && input.settings?.capacity > 0)
    fail('Seat limits are available for free exams. Paid exams must allow all verified buyers.');
  if (input.priceMinor > 0 && input.priceMinor < (input.currency === 'NGN' ? 10000 : 100))
    fail('Minimum paid entry is ₦100 or $1.');
  const logo = input.logo || null;
  if (logo && (typeof logo !== 'string' || !/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(logo)))
    fail('Choose a workspace logo.');
  return {
    title: text(input.title, 160, 'exam title', true),
    description: text(input.description || '', 3000, 'description'),
    subject: text(input.subject || '', 200, 'subject'),
    visibility: input.visibility,
    priceMinor: input.priceMinor,
    currency: input.currency,
    logo,
    settings: validateSettings(input.settings),
    questions: validateQuestions(input.questions || []),
  };
}
export function assertPublishable(exam, now = Date.now()) {
  if (!exam.questions.length) fail('Add questions before publishing.');
  const missing = exam.questions.findIndex((q) => q.type === 'mcq' && q.correct === null);
  if (missing !== -1) fail(`Question ${missing + 1} needs a correct answer before publishing.`);
  if (exam.settings.endsAt && Date.parse(exam.settings.endsAt) <= now)
    fail('Choose a closing time in the future.');
}
export function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function attemptQuestions(exam) {
  return (exam.settings.shuffleQuestions ? shuffled(exam.questions) : exam.questions).map((q) => {
    if (!exam.settings.shuffleOptions || q.type === 'theory') return structuredClone(q);
    const order = shuffled(q.options.map((_, i) => i));
    return {
      ...q,
      optionOrder: order,
      options: order.map((i) => q.options[i]),
      ...(q.optionsHtml ? { optionsHtml: order.map((i) => q.optionsHtml[i]) } : {}),
      correct: order.indexOf(q.correct),
    };
  });
}
export function grade(questions, answers, settings, manual = {}) {
  let earned = 0,
    possible = 0,
    pending = 0;
  const outcomes = questions.map((q) => {
    possible += q.marks;
    const answer = Object.hasOwn(answers, q.key) ? (answers[q.key] ?? null) : null;
    let score = 0,
      correct = false;
    if (q.type === 'theory') {
      if (typeof answer === 'string' && answer.trim()) {
        if (manual[q.key] === undefined) {
          pending++;
          correct = null;
        } else {
          score = integer(manual[q.key], 0, q.marks, 'written score');
          correct = score === q.marks;
        }
      }
    } else {
      correct = answer === q.correct;
      score = correct ? q.marks : answer == null ? 0 : -settings.negativeMark * q.marks;
    }
    earned += score;
    return {
      key: q.key,
      subject: q.subject,
      topic: q.topic,
      answer,
      choice: Number.isInteger(answer) ? (q.optionOrder?.[answer] ?? answer) : null,
      correct,
      score,
      possible: q.marks,
      unanswered: answer == null || answer === '',
    };
  });
  return {
    earned: Math.max(0, earned),
    possible,
    percent: possible ? Math.round((Math.max(0, earned) / possible) * 10000) / 100 : 0,
    pending,
    outcomes,
  };
}
export function safeQuestions(questions, solutions = false) {
  return questions.map((q) => {
    const { optionOrder, ...visible } = q;
    const { correct, explanation, explanationHtml, answerText, answerHtml, ...safe } = visible;
    return solutions ? visible : safe;
  });
}
export function visibleAssets(questions, assets = {}) {
  const keys = new Set(
    questions.flatMap((q) =>
      [q.questionHtml, ...(q.optionsHtml || []), q.explanationHtml, q.answerHtml].flatMap((html) =>
        [...String(html || '').matchAll(/pastq-asset:([a-f0-9]{64})/g)].map((match) => match[1]),
      ),
    ),
  );
  return Object.fromEntries(
    [...keys].filter((key) => Object.hasOwn(assets, key)).map((key) => [key, assets[key]]),
  );
}
export const released = (exam) =>
  exam.resultsReleased ||
  exam.settings.resultRelease === 'immediate' ||
  (exam.settings.resultRelease === 'after_close' &&
    (['closed', 'archived'].includes(exam.status) ||
      (exam.settings.endsAt && Date.parse(exam.settings.endsAt) <= Date.now())));
export { analytics } from '../shared/analytics.js';
