exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({error: 'Method not allowed'}),
      headers: {'Content-Type': 'application/json'}
    };
  }

  try {
    const { topic, audience, categories } = JSON.parse(event.body);
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({error: 'API key not configured'}),
        headers: {'Content-Type': 'application/json'}
      };
    }

    if (!topic || !categories) {
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
      timeout: 60000
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMsg = errorData.error?.message || 'Unknown error';
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

    // Extract JSON from response
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
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({error: error.message || 'Server error'}),
      headers: {'Content-Type': 'application/json'}
    };
  }
};
