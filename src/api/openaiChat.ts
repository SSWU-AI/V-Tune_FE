// src/api/openaiChat.ts
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
const OPENAI_MODEL   = import.meta.env.VITE_OPENAI_MODEL  || "gpt-4o-mini";
const OPENAI_BASE    = import.meta.env.VITE_OPENAI_BASE   || "https://api.openai.com";

// 안전장치
function assertReady() {
  if (!OPENAI_API_KEY) throw new Error("VITE_OPENAI_API_KEY 가 없습니다.");
}

// (A) 비스트리밍 호출 (간단)
export async function chatOnce(messages: Array<{role: "system"|"user"|"assistant"; content: string;}>) {
  assertReady();
  const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// (B) 스트리밍 호출 (토큰이 실시간으로 들어옴)
export async function* chatStream(messages: Array<{role: "system"|"user"|"assistant"; content: string;}>) {
  assertReady();
  const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
      stream: true,
    })
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 형식 파싱
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) yield delta;
      } catch {
        // ignore json parse errors for keep-alive lines
      }
    }
  }
}
