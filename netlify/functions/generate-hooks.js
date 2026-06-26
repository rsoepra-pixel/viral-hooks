exports.handler = async (event) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({error: "No key"}) };

    const body = JSON.parse(event.body);
    const { topic, audience, categories } = body;
    
    // SUPER SIMPLE: hanya 1 hook
    const prompt = `Make 1 viral hook about: ${topic}
Return ONLY: [{"cat":"test","text":"hook text here","platform":"TikTok","emotion":"curiosity","why":"works"}]`;

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
        max_tokens: 500,
        messages: [{role: "user", content: prompt}]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({error: `HTTP ${response.status}`}) };
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
    return { statusCode: 500, body: JSON.stringify({error: e.message}) };
  }
};
