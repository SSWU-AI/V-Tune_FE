import React, { useState, useRef } from "react";
import "./ChatBot.css";

const OPENAI_API_KEY = "sk-하드코딩된_API_KEY"; // 테스트용

interface Message {
  sender: "user" | "bot";
  text: string;
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 🎤 마이크 녹음 시작/종료
  const toggleRecording = async () => {
    if (!recording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = handleAudioStop;
      mediaRecorder.start();
      setRecording(true);
    } else {
      mediaRecorderRef.current?.stop();
      setRecording(false);
    }
  };

  // 🎯 녹음 완료 후 처리
  const handleAudioStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model", "whisper-1");

    // 1. STT - 음성을 텍스트로 변환
    const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    const sttData = await sttRes.json();
    const userText = sttData.text;
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);

    // 2. GPT 응답
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          ...messages.map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text })),
          { role: "user", content: userText },
        ],
      }),
    });
    const chatData = await chatRes.json();
    const botText = chatData.choices[0].message.content;
    setMessages((prev) => [...prev, { sender: "bot", text: botText }]);

    // 3. TTS - 봇 응답을 음성으로 변환
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: botText,
      }),
    });

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBlobTTS = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(audioBlobTTS);
    new Audio(audioUrl).play();
  };

  return (
    <div className="chat-container">
      <div className="chat-box">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.sender}`}>
            {m.text}
          </div>
        ))}
      </div>
      <button onClick={toggleRecording} className={recording ? "stop" : "record"}>
        {recording ? "⏹️ 녹음 중지" : "🎤 녹음 시작"}
      </button>
    </div>
  );
}
