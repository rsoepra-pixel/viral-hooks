exports.handler = async (event) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({error: "No API key"}) };

    const body = JSON.parse(event.body);
    const { topic, audience, categories } = body;
    if (!topic || !categories) return { statusCode: 400, body: JSON.stringify({error: "Missing fields"}) };

    // Generate 25 hooks per batch, bilingual (50 total for 2 batches)
    const hooksPerBatch = 25;
    const prompt = `Generate ${hooksPerBatch} viral hooks about: ${topic}
Audience: ${audience || "general"}
Categories: ${categories.join(", ")}

RULES:
- Generate EXACTLY ${hooksPerBatch} hooks total
- Distribute hooks across ${categories.length} categories and 2 languages (Indonesian & English)
- Use ALL provided categories
- Each hook must be different, creative, and compelling
- Mix of Indonesian (id) and English (en) language hooks
- Return ONLY valid JSON array, no preamble
- Format EXACTLY: [{"cat":"Category","text":"hook text","lang":"id"|"en","platform":"TikTok/Instagram/LinkedIn","emotion":"emotion type","why":"why it works"},...]`;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 60000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        messages: [{role: "user", content: prompt}]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({error: "API error"}) };
    }

    const data = await response.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { statusCode: 500, body: JSON.stringify({error: "No JSON"}) };
    
    const hooks = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({success: true, hooks: hooks, count: hooks.length})
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { statusCode: 408, body: JSON.stringify({error: "Timeout >60s"}) };
    }
    return { statusCode: 500, body: JSON.stringify({error: e.message}) };
  }
};
