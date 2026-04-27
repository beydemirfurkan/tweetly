const { config, assertOpenRouter } = require('../config');
const { SYSTEM_PROMPT, userPrompt, RETRY_USER_NOTE } = require('./prompts');

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

async function chat(messages) {
  assertOpenRouter();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': config.openrouter.referer,
      'X-Title': config.openrouter.appName,
    },
    body: JSON.stringify({
      model: config.openrouter.model,
      messages,
      temperature: 0.7,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error(`OpenRouter cevabı boş: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return content.trim();
}

function clean(text) {
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}

async function generateTweet(repo) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt(repo) },
  ];

  let text = clean(await chat(messages));

  if (text.length > 280) {
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: RETRY_USER_NOTE });
    text = clean(await chat(messages));
  }

  if (text.length > 280) {
    throw new Error(`Tweet 280 karakteri aşıyor (${text.length}): ${text.slice(0, 80)}…`);
  }
  if (!text) {
    throw new Error('Boş tweet metni döndü');
  }

  return text;
}

module.exports = { generateTweet, chat };
