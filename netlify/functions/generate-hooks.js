exports.handler = async (event) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: "Missing API key" })
      };
    }

    const { topic, audience, categories } = JSON.parse(event.body);
    if (!topic || !categories) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "Missing topic or categories" })
      };
    }

    const prompt = `Generate 10 viral social media hooks about: ${topic}
Target audience: ${audience || "general"}
Categories: ${categories.join(", ")}

IMPORTANT: Each hook MUST have BOTH Indonesian AND English versions.

Return ONLY valid JSON array with NO other text:
[{"cat":"Category","text_id":"Indonesian hook","text_en":"English hook","platform":"TikTok|Instagram|LinkedIn|YouTube","emotion":"emotion"}]`;

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
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ success: false, error: "Claude API error" })
      };
    }

    const data = await response.json();
    const text = data.content[0].text;
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: "No JSON in response" })
      };
    }

    const hooks = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, hooks: hooks })
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
