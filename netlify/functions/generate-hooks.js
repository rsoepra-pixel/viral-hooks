exports.handler = async (event) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({error: "No API key"}) };

    const body = JSON.parse(event.body);
    const { topic, audience, categories } = body;
    if (!topic || !categories) return { statusCode: 400, body: JSON.stringify({error: "Missing"}) };

    // Test concurrent: 10 hooks per batch
    const hooksPerBatch = 10;
    const prompt = `Generate ${hooksPerBatch} viral social media hooks about: ${topic}
Target audience: ${audience || "general"}
Categories: ${categories.join(", ")}

Instructions:
- Generate exactly ${hooksPerBatch} hooks
- Mix Indonesian (lang: "id") and English (lang: "en")
- Distribute across the ${categories.length} categories
- Each hook unique, engaging, compelling
- Return ONLY JSON array - no other text

Format: [{"cat":"Category","text":"hook text","lang":"id"|"en","platform":"TikTok|Instagram|LinkedIn|YouTube","emotion":"word","why":"reason"},...]`;

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
        max_tokens: 2000,
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
      return { statusCode: 408, body: JSON.stringify({error: "Timeout"}) };
    }
    return { statusCode: 500, body: JSON.stringify({error: e.message}) };
  }
};
