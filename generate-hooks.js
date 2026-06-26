exports.handler = async (event) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({error: "No API key"}) };

    const body = JSON.parse(event.body);
    const { topic, audience, categories } = body;
    if (!topic || !categories) return { statusCode: 400, body: JSON.stringify({error: "Missing fields"}) };

    const prompt = `Generate ${categories.length * 10} viral hooks: ${topic}
Audience: ${audience || "general"}
Categories: ${categories.join(", ")}
Return ONLY this format: [{"cat":"X","text":"Y","platform":"Z","emotion":"A","why":"B"},...]`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        messages: [{role: "user", content: prompt}]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return { statusCode: response.status, body: JSON.stringify({error: err.error?.message || "API Error"}) };
    }

    const data = await response.json();
    const text = data.content[0].text;
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { statusCode: 500, body: JSON.stringify({error: "No JSON array found"}) };
    
    const hooks = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({success: true, hooks: hooks, count: hooks.length})
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({error: e.message}) };
  }
};
