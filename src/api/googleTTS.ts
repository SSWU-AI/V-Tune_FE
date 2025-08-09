// src/api/googleTTS.ts
export async function fetchGoogleTTS(text: string, apiKey: string): Promise<string | null> {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
  const body = {
    input: { text },
    voice: { languageCode: "ko-KR", name: "ko-KR-Standard-A" },
    audioConfig: { audioEncoding: "MP3" }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.audioContent || null;
}
