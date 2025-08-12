// src/components/ChatBotScreen.tsx
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { transcribeBlob } from "../api/googleSTT";
import { fetchGoogleTTS } from "../api/googleTTS";
import "../styles/ChatBotScreen.css";

import prevIcon from "../assets/icons/prev.svg";
import micIcon from "../assets/icons/mic.svg";
import stopIcon from "../assets/icons/stop.svg";
import sendIcon from "../assets/icons/send.svg";

type Msg = { role: "user" | "bot"; text: string };
type OAChatMsg = { role: "system" | "user" | "assistant"; content: string };

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
const OPENAI_MODEL   = (import.meta.env.VITE_OPENAI_MODEL as string) || "gpt-4o-mini";
const OPENAI_BASE    = (import.meta.env.VITE_OPENAI_BASE as string) || "https://api.openai.com";
const GOOGLE_TTS_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY as string;

function assertReady() {
  if (!OPENAI_API_KEY) throw new Error("VITE_OPENAI_API_KEY 가 설정되지 않았습니다.");
}

/* ---------- 스트레칭 화면으로 루틴 전달 ---------- */
function setSelectedRoutineForStretching(routineId: number) {
  sessionStorage.setItem("stretchingRoutineId", String(routineId)); // 1..N
}

const routineNames = ["척추 유연성 루틴", "몸통 비틀기 루틴", "전신 이완 루틴", "하체 강화 루틴"];

/* 숨김 마커/정리 */
const RID_RE = /\[\[\s*ROUTINE_ID\s*:\s*([1-4])\s*\]\]/i;
function stripRoutineMarker(s: string) { return s.replace(RID_RE, "").trim(); }

/* 마크다운 → 평문 */
function toPlainText(raw: string) {
  let t = stripRoutineMarker(raw);
  t = t.replace(/```[\s\S]*?```/g, "");  // 코드블록
  t = t.replace(/`[^`]*`/g, "");         // 인라인코드
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  t = t.replace(/^\s*>+\s?/gm, "").replace(/^\s*#{1,6}\s*/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/* 루틴 id 추출 */
function extractRoutineIdFromText(text: string): number | null {
  const m = text.match(RID_RE); if (m) return Number(m[1]);
  const j = text.match(/"routine_id"\s*:\s*([1-4])/i); if (j) return Number(j[1]);
  const n = text.match(/(?:루틴\s*([1-4])|([1-4])\s*번\s*루틴)/); if (n) return Number(n[1] || n[2]);
  const nameMap: Record<number, RegExp> = {
    1: /(척추\s*유연성|낙타|쟁기|아기\s*자세|상향\s*플랭크)/,
    2: /(몸통\s*비틀기|전굴\s*자세|비틀린|삼각자세)/,
    3: /(전신\s*이완|엄지발가락|고양이\s*자세|메뚜기|무한\s*자세)/,
    4: /(하체\s*강화|브릿지|스쿼트)/,
  };
  for (const id of [1,2,3,4] as const) if (nameMap[id].test(text)) return id;
  return null;
}

/* 운동 시작 의사 확인 패턴 */
function isStartConfirmation(text: string): boolean {
  const confirmPatterns = [
    /네\s*,?\s*(시작|해주세요|좋아요|그래요)/,
    /좋아요?\s*,?\s*(시작|해주세요|그래요)/,
    /알겠어요?\s*,?\s*(시작|해주세요)/,
    /그래요?\s*,?\s*(시작|해주세요)/,
    /응\s*,?\s*(시작|해주세요|좋아요|그래요)/,
    /(시작|해주세요|할게요|하겠어요|고고)/,
    /^(네|응|좋아|알겠어|그래|yes|ok)$/i,
  ];
  return confirmPatterns.some(pattern => pattern.test(text.trim()));
}

const ChatBotScreen: React.FC = () => {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Msg[]>([
    { role: "bot", text: "안녕하세요! AI 운동 코치입니다.\n무엇을 도와드릴까요?" },
  ]);
  const [recording, setRecording] = useState(false);
  const [input, setInput] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [pendingRoutineId, setPendingRoutineId] = useState<number | null>(null); // 시작 대기 중인 루틴

  // refs (한 번만 선언)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const trackingRef = useRef(false);
  const EDGE = 24;   // 왼쪽 엣지 px
  const DIST = 80;   // 최소 가로 이동 px
  const MAX_DY = 40; // 허용 세로 흔들림 px
  const MAX_MS = 600;// 제스처 최대 시간 ms
  const touchStartsOnForm = (el: EventTarget | null) =>
    !!(el as HTMLElement | null)?.closest("input,textarea,button");

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t || touchStartsOnForm(e.target)) return;
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    startTimeRef.current = e.timeStamp;
    trackingRef.current = t.clientX <= EDGE;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!trackingRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startXRef.current;
    const dy = Math.abs(t.clientY - startYRef.current);
    if (dx > 10 && dy < MAX_DY) e.preventDefault();
  };
    
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startXRef.current;
    const dy = Math.abs(t.clientY - startYRef.current);
    const dt = e.timeStamp - startTimeRef.current;
    if (dx >= DIST && dy <= MAX_DY && dt <= MAX_MS) {
        cleanupAudio();
        navigate("/");
    }
  };

  const cleanupAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
  };

  const playBase64Mp3 = async (base64: string) => {
    cleanupAudio();
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    audioUrlRef.current = url;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    try { await audioRef.current.play(); } catch (error) {
      console.warn("Audio play failed:", error);
    }
  };

  /* 시스템 프롬프트 */
  const toOpenAIMessages = (msgs: Msg[]): OAChatMsg[] => {
    const system: OAChatMsg = {
      role: "system",
      content: `당신은 한국어 운동 코치입니다. 따뜻하고 자연스러운 말투로, 간결하게 안내하세요.
- 마크다운 금지(코드블록/백틱/*/**/_/~/#/>, 이모지 금지).
- 횟수/시간/세트/유지/호흡 숫자는 절대 쓰지 않습니다.
- 아래 형식을 **정확히** 따릅니다.

[형식]
1줄: "<루틴 이름(번호)>을 추천드릴게요. — <짧은 이유>."
2줄: "이 루틴은 다음의 운동으로 구성되어있어요."
3~6줄: 1) 운동명
       2) 운동명
       3) 운동명
       4) 운동명
7줄: (짧은 마무리 한 문장)

- 답변 맨 끝(마지막 줄 뒤 공백)에 [[ROUTINE_ID:n]] 마커를 반드시 붙이세요. (사용자에겐 보이지 않음)

가능한 루틴:
  1. 척추 유연성 루틴 — 낙타 자세/쟁기 자세/아기 자세/상향 플랭크 자세
  2. 몸통 비틀기 루틴 — 전굴 자세/비틀린 무릎-머리 닿기 자세/비틀린 반다리 벌리기 전굴 자세/비틀린 삼각 자세
  3. 전신 이완 루틴 — 엄지발가락 잡기 자세/고양이 자세/메뚜기 자세/무한 자세
  4. 하체 강화 루틴 — 브릿지 자세/스쿼트 자세/아기 자세/상향 플랭크 자세`,
    };
    const mapped: OAChatMsg[] = msgs.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as OAChatMsg["role"],
      content: m.text,
    }));
    return [system, ...mapped];
  };

  /* ---- 전송 (비스트리밍) ---- */
  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 운동 시작 확인 중이고 긍정 답변인 경우
    if (pendingRoutineId && isStartConfirmation(trimmed)) {
      setMessages(prev => [...prev, { role: "user", text: trimmed }]);
      
      const startMessage = `좋습니다! ${routineNames[pendingRoutineId - 1]}을 시작하겠습니다.`;
      setMessages(prev => [...prev, { role: "bot", text: startMessage }]);
      
      if (voiceOn && GOOGLE_TTS_KEY) {
        try {
          const audioBase64 = await fetchGoogleTTS(startMessage, GOOGLE_TTS_KEY);
          if (audioBase64) await playBase64Mp3(audioBase64);
        } catch (err) {
          console.warn("TTS 실패:", err);
        }
      }
      
      // sessionStorage에도 저장 (fallback용)
      setSelectedRoutineForStretching(pendingRoutineId);
      
      const routineIdToPass = pendingRoutineId;
      setPendingRoutineId(null);
      
      // URL 파라미터로 루틴 ID 전달
      setTimeout(() => {
        cleanupAudio();
        navigate(`/stretch?routineId=${routineIdToPass}`);
      }, 1000);
      
      return;
    }

    setMessages(prev => [...prev, { role: "user", text: trimmed }, { role: "bot", text: "🤖 생각 중..." }]);
    setInput("");
    setThinking(true);
    setPendingRoutineId(null); // 새 질문이므로 대기 상태 초기화

    try {
      const body = {
        model: OPENAI_MODEL,
        messages: toOpenAIMessages([...messages, { role: "user", text: trimmed }]),
        temperature: 0.6
      };

      assertReady();
      const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "요청 실패"));
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content || "";

      const picked = extractRoutineIdFromText(raw);
      const finalText = toPlainText(raw);

      // 마지막 "🤖 생각 중..." 버블을 최종 텍스트로 교체
      setMessages(prev => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "bot" && copy[i].text === "🤖 생각 중...") {
            copy[i] = { role: "bot", text: finalText || "응답을 받지 못했어요." };
            break;
          }
        }
        return copy;
      });

      // 루틴이 추천된 경우 운동 시작 의사 확인 메시지 추가
      if (picked) {
        const confirmMessage = "운동을 시작하시겠습니까?";
        setTimeout(() => {
          setMessages(prev => [...prev, { role: "bot", text: confirmMessage }]);
          setPendingRoutineId(picked);
          
          // TTS: 추천 내용 + 시작 확인 메시지
          const fullSpeech = [finalText, confirmMessage].join("\n");
          if (voiceOn && GOOGLE_TTS_KEY && fullSpeech) {
            fetchGoogleTTS(fullSpeech, GOOGLE_TTS_KEY)
              .then(audioBase64 => {
                if (audioBase64) return playBase64Mp3(audioBase64);
              })
              .catch(err => console.warn("TTS 실패:", err));
          }
        }, 500);
      } else {
        // 루틴 추천이 아닌 일반 답변의 경우 TTS만
        if (voiceOn && GOOGLE_TTS_KEY && finalText) {
          try {
            const audioBase64 = await fetchGoogleTTS(finalText, GOOGLE_TTS_KEY);
            if (audioBase64) await playBase64Mp3(audioBase64);
          } catch (err) {
            console.warn("TTS 실패:", err);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "요청 실패";
      setMessages(prev => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "bot" && copy[i].text === "🤖 생각 중...") {
            copy[i] = { role: "bot", text: `❌ 오류: ${errorMessage}` };
            break;
          }
        }
        return copy;
      });
    } finally {
      setThinking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!thinking) sendText(input); };

  /* ---- STT ---- */
  const startSTT = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorderRef.current = mr;
    chunksRef.current = [];
    setRecording(true);
    setMessages(prev => [...prev, { role: "bot", text: "🎙 인식 중..." }]);

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      setMessages(prev => prev.filter(m => m.text !== "🎙 인식 중..."));
      setRecording(false);
      try {
        const { text } = await transcribeBlob(blob);
        await sendText((text || "").trim() || "(인식 결과 없음)");
      } catch (error) {
        console.warn("STT 실패:", error);
        setMessages(prev => [...prev, { role: "bot", text: "❌ 음성 인식 실패" }]);
      }
    };
    mr.start();
  };
  const stopSTT = () => { mediaRecorderRef.current?.stop(); };

  return (
    <div
        ref={containerRef}
        className="chat-container"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
    >
      {/* 상단 바 */}
      <div className="chat-topbar">
        <button
          onClick={() => { cleanupAudio(); navigate("/"); }}
          aria-label="뒤로가기"
          className="icon-btn"
          title="뒤로가기"
        >
          <img src={prevIcon} alt="back" className="icon-20" />
        </button>

        <h2 className="chat-title">V-Tune</h2>

        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => setVoiceOn(v => !v)}
            title={voiceOn ? "음성 답변 끄기" : "음성 답변 켜기"}
            className={`voice-toggle ${voiceOn ? "" : "off"}`}
          >
            {voiceOn ? "🔈 음성 On" : "🔇 음성 Off"}
          </button>
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="chat-area">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>

      {/* 하단 입력/음성 바 */}
      <form onSubmit={handleSubmit} className="chat-inputbar">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={thinking ? "AI가 생각 중입니다..." : "AI 코치에게 무엇이든 물어보세요!"}
          disabled={thinking}
          className="chat-input"
        />

        <button
          type="button"
          onClick={recording ? stopSTT : startSTT}
          aria-label={recording ? "인식 중지" : "음성 인식 시작"}
          disabled={thinking}
          className="icon-btn"
          title={recording ? "인식 중지" : "음성 인식 시작"}
        >
          <img src={recording ? stopIcon : micIcon} alt="" className="icon-20" />
        </button>

        <button
          type="submit"
          aria-label="메시지 전송"
          disabled={thinking}
          className="icon-btn"
          title="전송"
        >
          <img src={sendIcon} alt="send" className="icon-20" />
        </button>
      </form>
    </div>
  );
};

export default ChatBotScreen;