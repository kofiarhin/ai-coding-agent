const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const callLLM = async (messages) => {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.MODEL || 'llama-3.1-8b-instant';
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set.');
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model,
        messages,
        temperature: 0.2,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const { data } = response;
    if (!data || !data.choices || !data.choices.length) {
      throw new Error('Empty response from Groq.');
    }
    const choice = data.choices[0];
    return choice.message && choice.message.content ? choice.message.content.trim() : '';
  } catch (error) {
    const message = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
    throw new Error(`Groq request failed: ${message}`);
  }
};

module.exports = callLLM;
