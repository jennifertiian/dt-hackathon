'use strict';

// Keep generation server-side: only the calendar date and a public topic seed leave the app.
const MODEL = 'gpt-6-luna';
const REASONING_EFFORT = 'low';
const TYPES = ['MultipleChoice', 'Checkbox', 'ShortResponse'];
const TOPICS = ['study breaks', 'creative hobbies', 'campus afternoons', 'food discoveries', 'weekend plans', 'music', 'favorite places'];

class QuestionGenerationError extends Error {
  constructor(code, status) {
    super(`Question generation unavailable (${code}).`);
    this.name = 'QuestionGenerationError';
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

function validateDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new TypeError('Quiz day must be a valid YYYY-MM-DD date.');
  }
  return day;
}

function seedForDay(day) {
  validateDay(day);
  let seed = 2166136261;
  for (const char of day) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

function typeForDay(day) { return TYPES[seedForDay(day) % TYPES.length]; }

function schemaForType(type) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['Prompt', 'Type', 'Choices'],
    properties: {
      Prompt: { type: 'string', minLength: 1, maxLength: 180 },
      Type: { type: 'string', enum: [type] },
      Choices: { type: 'array', minItems: type === 'ShortResponse' ? 0 : 3, maxItems: type === 'ShortResponse' ? 0 : 5,
        items: { type: 'string', minLength: 1, maxLength: 80 } }
    }
  };
}

function canonicalQuestion(day, value, expectedType = typeForDay(day)) {
  validateDay(day);
  const invalid = () => { throw new QuestionGenerationError('invalid_output'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'Choices,Prompt,Type' || value.Type !== expectedType ||
      typeof value.Prompt !== 'string' || !value.Prompt.trim() || value.Prompt.length > 180 || !Array.isArray(value.Choices)) invalid();
  const labels = value.Choices;
  if (expectedType === 'ShortResponse' ? labels.length !== 0 : labels.length < 3 || labels.length > 5) invalid();
  if (labels.some(label => typeof label !== 'string' || !label.trim() || label.length > 80)) invalid();
  if (new Set(labels.map(label => label.trim().toLocaleLowerCase('en-US'))).size !== labels.length) invalid();
  return {
    ID: `question:${day}`, QuizDay: day, Prompt: value.Prompt.trim(), Type: expectedType,
    Choices: labels.map((label, i) => ({ ID: `choice:${day}:${i + 1}`, Label: label.trim() }))
  };
}

function responseText(payload) {
  if (!payload || payload.status !== 'completed' || !Array.isArray(payload.output)) {
    throw new QuestionGenerationError('incomplete_response');
  }
  const content = payload.output.flatMap(item => item.type === 'message' && Array.isArray(item.content) ? item.content : []);
  if (content.some(item => item.type === 'refusal')) throw new QuestionGenerationError('refusal');
  const parts = content.filter(item => item.type === 'output_text' && typeof item.text === 'string');
  if (!parts.length) throw new QuestionGenerationError('invalid_output');
  return parts.map(item => item.text).join('');
}

function codeForStatus(status) {
  if (status === 401) return 'authentication';
  if (status === 403 || status === 404) return 'model_access';
  if (status === 429) return 'quota_or_rate_limit';
  if (status >= 500) return 'provider_unavailable';
  return 'request_rejected';
}

async function generateQuestion(day, { apiKey = process.env.CHATGPT_API_KEY, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  validateDay(day);
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new QuestionGenerationError('missing_key');
  if (typeof fetchImpl !== 'function') throw new QuestionGenerationError('network');
  const type = typeForDay(day);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(45000, Math.max(1, Number(timeoutMs) || 20000)));
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, reasoning: { effort: REASONING_EFFORT }, store: false, max_output_tokens: 700,
        instructions: 'Write one friendly, concise daily icebreaker for Berkeley students meeting new friends. Use ordinary preferences and interests, not sensitive personal data. Avoid assumptions about identity, private information, or distress. Return only the requested JSON. Each question has exactly one type. For MultipleChoice or Checkbox give 3-5 distinct short labels; for ShortResponse give no choices. Do not include an other/free-text choice in choice questions.',
        input: `Calendar day: ${day}. Public topic seed: ${TOPICS[seedForDay(day) % TOPICS.length]}. Required question type: ${type}.`,
        text: { format: { type: 'json_schema', name: 'daily_question', strict: true, schema: schemaForType(type) } }
      })
    });
    // Deliberately never include provider error bodies or thrown fetch messages in app errors.
    if (!response.ok) throw new QuestionGenerationError(codeForStatus(response.status), response.status);
    const raw = await response.text();
    if (raw.length > 100000) throw new QuestionGenerationError('invalid_output');
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new QuestionGenerationError('invalid_output'); }
    let value;
    const output = responseText(payload);
    try { value = JSON.parse(output); } catch { throw new QuestionGenerationError('invalid_output'); }
    return canonicalQuestion(day, value, type);
  } catch (error) {
    if (error instanceof QuestionGenerationError) throw error;
    throw new QuestionGenerationError(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timeout);
  }
}

// A visible offline mode, never an alternate model or another AI provider.
function fallbackQuestion(day) {
  const type = typeForDay(day);
  const variant = Math.floor(seedForDay(day) / TYPES.length) % 3;
  const examples = {
    MultipleChoice: [
      ['Which study-break plan sounds best today?', ['A short walk', 'Coffee with someone', 'A quiet playlist', 'A snack adventure']],
      ['Where would you spend a free hour?', ['A cafe', 'Outside in the sun', 'A cozy reading spot', 'Exploring campus']],
      ['What is your ideal low-key hangout?', ['A movie night', 'A board game', 'Cooking together', 'A walk and a chat']]
    ],
    Checkbox: [
      ['Which activities would you like company for?', ['Trying new food', 'Studying', 'Making art', 'Taking a walk']],
      ['Which little things brighten your week?', ['Good music', 'A new book', 'A shared meal', 'Time outdoors']],
      ['What might you try this weekend?', ['A campus event', 'A new recipe', 'A creative project', 'A new walking route']]
    ],
    ShortResponse: [
      ['What is a small hobby you would enjoy sharing with a new friend?', []],
      ['What is your favorite way to unwind after class?', []],
      ['What is one place you would like to explore with someone?', []]
    ]
  };
  const [Prompt, Choices] = examples[type][variant];
  return canonicalQuestion(day, { Prompt, Type: type, Choices }, type);
}

async function generateQuestionResult(day, options = {}) {
  validateDay(day);
  try {
    return { question: await generateQuestion(day, options), source: 'luna', model: MODEL, errorCode: null };
  } catch (error) {
    return { question: fallbackQuestion(day), source: 'fallback', model: null,
      errorCode: error instanceof QuestionGenerationError ? error.code : 'generation_unavailable' };
  }
}

function localDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function nextDay(day) {
  validateDay(day);
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function ensureQuestions(store, { days = [localDay(), nextDay(localDay())], ...options } = {}) {
  const results = [];
  for (const day of [...new Set(days)]) {
    validateDay(day);
    const existing = await store.questionForDay(day);
    if (existing) { results.push({ question: existing, source: 'existing', model: null, errorCode: null }); continue; }
    const result = await generateQuestionResult(day, options);
    await store.saveQuestion(result.question, result.source);
    results.push(result);
  }
  return results;
}

module.exports = { MODEL, REASONING_EFFORT, TYPES, QuestionGenerationError, typeForDay, canonicalQuestion,
  generateQuestion, generateQuestionResult, fallbackQuestion, ensureQuestions, localDay, nextDay };

if (require.main === module) {
  // CLI output is restricted to a question and safe diagnostics; no provider response dump.
  try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const dayIndex = process.argv.indexOf('--day');
  const day = dayIndex >= 0 ? process.argv[dayIndex + 1] : localDay();
  generateQuestionResult(day).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(() => { console.error('Question generation requires a valid --day YYYY-MM-DD.'); process.exitCode = 1; });
}
