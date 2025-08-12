const STT_KEY = import.meta.env.VITE_GOOGLE_STT_API_KEY as string;

async function blobToBase64Content(blob: Blob) {
  const buf = await blob.arrayBuffer();
  let bin = "";
  new Uint8Array(buf).forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// webm/ogg(opus)은 beta 엔드포인트 권장, wav(PCM)는 v1
const V1 = "https://speech.googleapis.com/v1/speech:recognize";
const BETA = "https://speech.googleapis.com/v1p1beta1/speech:recognize";

export async function transcribeBlob(blob: Blob) {
  if (!STT_KEY) throw new Error("VITE_GOOGLE_STT_API_KEY 가 설정되지 않았습니다.");

  // 녹음 포맷에 따라 인코딩 추정
  const mime = (blob.type || "").toLowerCase();
  const isWav = mime.includes("wav");
  const isOgg = mime.includes("ogg");
  const isWebm = mime.includes("webm");

  const encoding =
    isWav ? "LINEAR16" :
    isOgg ? "OGG_OPUS" :
    "WEBM_OPUS"; // 기본값: webm(opus)

  const useBeta = encoding.includes("OPUS"); // opus면 beta
  const url = `${useBeta ? BETA : V1}?key=${STT_KEY}`;

  const base64 = await blobToBase64Content(blob);

  const body: any = {
    config: {
      languageCode: "ko-KR",
      encoding,
      enableAutomaticPunctuation: true,
    },
    audio: { content: base64 }
  };

  // WAV(PCM)일 때만 샘플레이트 지정(예: 16000)
  if (encoding === "LINEAR16") body.config.sampleRateHertz = 16000;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();

  const text = (data.results ?? [])
    .map((r: any) => r.alternatives?.[0]?.transcript ?? "")
    .join("\n");

  return { text, raw: data };
}
