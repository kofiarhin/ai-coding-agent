const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const streamLLM = async ({ messages, onToken }) => {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.MODEL || 'llama-3.1-8b-instant';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Groq stream failed with status ${response.status}`);
  }

  let aggregated = '';
  let buffer = '';

  const iterator = response.body[Symbol.asyncIterator]();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await iterator.next();
    if (done) {
      break;
    }
    buffer += value.toString();

    const segments = buffer.split('\n\n');
    buffer = segments.pop();

    for (const segment of segments) {
      if (!segment.trim()) {
        continue;
      }
      const line = segment.trim();
      if (!line.startsWith('data:')) {
        continue;
      }
      const payload = line.replace('data:', '').trim();
      if (payload === '[DONE]') {
        buffer = '';
        break;
      }
      try {
        const json = JSON.parse(payload);
        const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (delta) {
          aggregated += delta;
          if (onToken) {
            await onToken(delta);
          }
        }
      } catch (error) {
        buffer = `${payload}\n`;
      }
    }
  }

  if (buffer && buffer.trim() && buffer.trim() !== '[DONE]') {
    try {
      const json = JSON.parse(buffer.trim().replace(/^data:\s*/i, ''));
      const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
      if (delta) {
        aggregated += delta;
        if (onToken) {
          await onToken(delta);
        }
      }
    } catch (error) {
      // ignore trailing parse errors
    }
  }

  return aggregated.trim();
};

module.exports = streamLLM;
