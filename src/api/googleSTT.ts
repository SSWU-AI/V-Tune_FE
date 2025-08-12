const STT_KEY = import.meta.env.VITE_GOOGLE_STT_API_KEY as string;

// Google Speech-to-Text API 응답 타입 정의
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResult {
  alternatives: SpeechRecognitionAlternative[];
  channelTag?: number;
  resultEndTime?: string;
  languageCode?: string;
}

interface SpeechRecognitionResponse {
  results: SpeechRecognitionResult[];
  totalBilledTime?: string;
  speechAdaptationInfo?: object;
  requestId?: string;
}

// 설정 인터페이스
interface RecognitionConfig {
  languageCode: string;
  encoding: string;
  enableAutomaticPunctuation: boolean;
  sampleRateHertz?: number;
}

interface RecognitionAudio {
  content: string;
}

interface SpeechRecognitionRequest {
  config: RecognitionConfig;
  audio: RecognitionAudio;
}

// 함수 반환 타입
interface TranscriptionResult {
  text: string;
  raw: SpeechRecognitionResponse;
}

async function blobToBase64Content(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = "";
  new Uint8Array(buf).forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// webm/ogg(opus)은 beta 엔드포인트 권장, wav(PCM)는 v1
const V1 = "https://speech.googleapis.com/v1/speech:recognize";
const BETA = "https://speech.googleapis.com/v1p1beta1/speech:recognize";

export async function transcribeBlob(blob: Blob): Promise<TranscriptionResult> {
  if (!STT_KEY) throw new Error("VITE_GOOGLE_STT_API_KEY 가 설정되지 않았습니다.");

  // 녹음 포맷에 따라 인코딩 결정
  const mime = (blob.type || "").toLowerCase();
  
  let encoding: string;
  if (mime.includes("wav")) {
    encoding = "LINEAR16";
  } else if (mime.includes("ogg")) {
    encoding = "OGG_OPUS";
  } else {
    encoding = "WEBM_OPUS"; // 기본값 (webm 포함)
  }

  const useBeta = encoding.includes("OPUS"); // opus면 beta
  const url = `${useBeta ? BETA : V1}?key=${STT_KEY}`;

  const base64 = await blobToBase64Content(blob);

  const body: SpeechRecognitionRequest = {
    config: {
      languageCode: "ko-KR",
      encoding,
      enableAutomaticPunctuation: true,
    },
    audio: { content: base64 }
  };

  // WAV(PCM)일 때만 샘플레이트 지정
  if (encoding === "LINEAR16") {
    body.config.sampleRateHertz = 16000;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(await res.text());
  const data: SpeechRecognitionResponse = await res.json();

  const text = (data.results ?? [])
    .map((r: SpeechRecognitionResult) => r.alternatives?.[0]?.transcript ?? "")
    .join("\n");

  return { text, raw: data };
}