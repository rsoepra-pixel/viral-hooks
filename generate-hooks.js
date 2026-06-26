exports.handler = async (event, context) => {
  try {
    // Only POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({error: 'Method not allowed'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    const body = JSON.parse(event.body);
    const { topic, audience, categories } = body;
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({error: 'API key not configured on server'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    if (!topic || !categories || !Array.isArray(categories)) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Missing topic or categories'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    const count = categories.length * 10;
    const prompt = `Generate ${count} viral hooks: ${topic}\n` +
      `Audience: ${audience || 'general'}\n` +
      `Categories: ${categories.join(', ')}\n` +
      `Return ONLY valid JSON array []. Each item: {cat, text, platform, emotion, why}.\n` +
      `Be concise. Include [ and ].`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 5000,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json();
      const errorMsg = errData.error?.message || 'Unknown error';
      return {
        statusCode: response.status,
        body: JSON.stringify({error: `Claude API error: ${errorMsg}`}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('');

    if (!text) {
      return {
        statusCode: 500,
        body: JSON.stringify({error: 'Empty response from Claude'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    // Parse JSON from response
    const firstBracket = text.indexOf('[');
    if (firstBracket < 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({error: 'No JSON array in response'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    let depth = 0;
    let endIdx = -1;
    for (let i = firstBracket; i < text.length; i++) {
      if (text[i] === '[' || text[i] === '{') depth++;
      if (text[i] === ']' || text[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx < 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({error: 'Incomplete JSON in response'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    const jsonStr = text.substring(firstBracket, endIdx + 1);
    const hooks = JSON.parse(jsonStr);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        hooks: hooks,
        count: hooks.length
      }),
      headers: {'Content-Type': 'application/json'}
    };

  } catch (error) {
    console.error('Handler error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: `Server error: ${error.message}`
      }),
      headers: {'Content-Type': 'application/json'}
    };
  }
};
