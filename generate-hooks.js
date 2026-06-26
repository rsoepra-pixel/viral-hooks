exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({error: "POST only"}) };
  }

  try {
    const { topic, audience, categories } = JSON.parse(event.body);
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) throw new Error("API key not set");
    if (!topic || !categories) throw new Error("Missing topic or categories");

    const count = categories.length * 10;
    const prompt = `Generate ${count} viral hooks: ${topic}
Audience: ${audience || "general"}
Categories: ${categories.join(", ")}
Return ONLY valid JSON array []. Each: {cat, text, platform, emotion, why}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "API error");
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end < 0) throw new Error("No JSON in response");

    const hooks = JSON.parse(text.substring(start, end + 1));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, hooks, count: hooks.length })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
