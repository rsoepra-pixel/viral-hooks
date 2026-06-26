exports.handler = async (event) => {
  try {
    console.log("=== START ===");
    
    const apiKey = process.env.CLAUDE_API_KEY;
    console.log("API Key exists:", !!apiKey);
    
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({error: "No API key"}) };

    const body = JSON.parse(event.body);
    const { topic, audience, categories } = body;
    console.log("Parsed body:", {topic, audience, categories});
    
    if (!topic || !categories) return { statusCode: 400, body: JSON.stringify({error: "Missing fields"}) };

    const prompt = `Generate ${categories.length * 10} viral hooks: ${topic}
Audience: ${audience || "general"}
Categories: ${categories.join(", ")}
Return ONLY: [{"cat":"X","text":"Y","platform":"Z","emotion":"A","why":"B"},...]`;

    console.log("Making fetch request...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        messages: [{role: "user", content: prompt}]
      })
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
      const text = await response.text();
      console.log("Error response:", text.substring(0, 200));
      return { 
        statusCode: response.status, 
        body: JSON.stringify({error: `HTTP ${response.status}: ${text.substring(0, 100)}`}) 
      };
    }

    const data = await response.json();
    console.log("Response parsed, content count:", data.content?.length);
    
    const text = data.content[0].text;
    console.log("Text length:", text.length);
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("No JSON match found");
      return { statusCode: 500, body: JSON.stringify({error: "No JSON found in response"}) };
    }
    
    const hooks = JSON.parse(jsonMatch[0]);
    console.log("Parsed hooks:", hooks.length);

    return {
      statusCode: 200,
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({success: true, hooks: hooks, count: hooks.length})
    };
  } catch (e) {
    console.error("CATCH ERROR:", e.message);
    return { statusCode: 500, body: JSON.stringify({error: `Error: ${e.message}`}) };
  }
};
