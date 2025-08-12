import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchGoogleTTS } from '../api/googleTTS';
const apiKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY;
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Webcam from 'react-webcam';
import { Pose, POSE_LANDMARKS, POSE_CONNECTIONS } from '@mediapipe/pose';
import type { Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import '../styles/StretchScreen.css';

import prevIcon from '../assets/icons/prev.svg';
import personIcon from '../assets/icons/person.svg';
import Popup from './Popup';

const MAX_DOTS = 3;

interface PoseStep {
  id: number;
  step_number: number;
  keypoints: string;
  pose_description: string;
  exercise: number;
}

interface Exercise {
  exercise_id: number;
  name: string;
  description: string;
  repetition: number;
  order: number;
}

const REQUIRED_KEYS = [
  'NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER',
  'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST',
  'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE',
  'LEFT_ANKLE', 'RIGHT_ANKLE'
] as const;

const StretchScreen: React.FC = () => {
  const [step, setStep] = useState(1);
  const [sets, setSets] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [exerciseName, setExerciseName] = useState('로딩 중...');
  const [exerciseDesc, setExerciseDesc] = useState('포즈 설명을 불러오는 중입니다...');
  const [poseSteps, setPoseSteps] = useState<PoseStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isStepMatched, setIsStepMatched] = useState(false);

  // 음성 재생 상태
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [hasFeedbackPlayed, setHasFeedbackPlayed] = useState(false);

  // 좌표 처리 간격
  const lastProcessedTimeRef = useRef<number>(0);
  const PROCESS_INTERVAL = 15000; // 15초

  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<cam.Camera | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const [searchParams] = useSearchParams();

  // 최신 상태를 onResults에서 안전하게 읽기 위한 refs
  const isPlayingTTSRef = useRef(isPlayingTTS);
  const isStepMatchedRef = useRef(isStepMatched);
  const hasFeedbackPlayedRef = useRef(hasFeedbackPlayed);
  const exercisesRef = useRef(exercises);
  const currentExerciseIndexRef = useRef(currentExerciseIndex);
  const stepRef = useRef(step);

  useEffect(() => { isPlayingTTSRef.current = isPlayingTTS; }, [isPlayingTTS]);
  useEffect(() => { isStepMatchedRef.current = isStepMatched; }, [isStepMatched]);
  useEffect(() => { hasFeedbackPlayedRef.current = hasFeedbackPlayed; }, [hasFeedbackPlayed]);
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  useEffect(() => { currentExerciseIndexRef.current = currentExerciseIndex; }, [currentExerciseIndex]);
  useEffect(() => { stepRef.current = step; }, [step]);

  // --- TTS Queue/Manager ---
  type TTSType = 'feedback' | 'description';
  type TTSTask = { text: string; type: TTSType; resolve?: () => void; };

  const ttsQueueRef = useRef<TTSTask[]>([]);
  const ttsProcessingRef = useRef(false);
  const lastDescKeyRef = useRef<string>('');

  // 오디오 핸들
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const descriptionAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopAllTTS = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (descriptionAudioRef.current) {
      descriptionAudioRef.current.pause();
      descriptionAudioRef.current = null;
    }
    setIsPlayingTTS(false);
  };

  const internalPlay = useCallback(async (text: string, type: TTSType) => {
    try {
      setIsPlayingTTS(true);

      if (type === 'feedback' && currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (type === 'description' && descriptionAudioRef.current) {
        descriptionAudioRef.current.pause();
        descriptionAudioRef.current = null;
      }

      const audioContent = await fetchGoogleTTS(text, apiKey);
      if (!audioContent) {
        setIsPlayingTTS(false);
        return;
      }

      const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
      if (type === 'description') descriptionAudioRef.current = audio;
      else currentAudioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.addEventListener('ended', () => {
          setIsPlayingTTS(false);
          if (type === 'description') descriptionAudioRef.current = null;
          else currentAudioRef.current = null;
          resolve();
        });
        audio.addEventListener('error', (e) => {
          setIsPlayingTTS(false);
          if (type === 'description') descriptionAudioRef.current = null;
          else currentAudioRef.current = null;
          reject(e);
        });
        audio.play().catch(reject);
      });
    } catch (e) {
      console.error('TTS 재생 오류:', e);
      setIsPlayingTTS(false);
    }
  }, [apiKey]);

  const processQueue = useCallback(async () => {
    if (ttsProcessingRef.current) return;
    ttsProcessingRef.current = true;
    try {
      while (ttsQueueRef.current.length) {
        const task = ttsQueueRef.current.shift()!;
        await internalPlay(task.text, task.type);
        task.resolve?.();
        await new Promise(r => setTimeout(r, 80)); // 약간의 인터벌
      }
    } finally {
      ttsProcessingRef.current = false;
    }
  }, [internalPlay]);

  const enqueueTTS = useCallback((text: string, type: TTSType) => {
    return new Promise<void>((resolve) => {
      if (!text) { resolve(); return; }

      if (type === 'feedback') {
        // 선점: 재생 중인 오디오 중단 + 큐를 피드백으로 갈아끼우기
        if (descriptionAudioRef.current) {
          descriptionAudioRef.current.pause();
          descriptionAudioRef.current = null;
        }
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        }
        ttsQueueRef.current = [{ text, type, resolve }];
      } else {
        // description: 동일 텍스트 중복 대기 금지
        const dupInQueue = ttsQueueRef.current.some(t => t.type === 'description' && t.text === text);
        const playingDesc = !!descriptionAudioRef.current;
        if (dupInQueue || playingDesc) { resolve(); return; }
        ttsQueueRef.current.push({ text, type, resolve });
      }

      processQueue();
    });
  }, [processQueue]);

  // 다음 스텝 이동
  const moveToNextStep = useCallback(() => {
    lastProcessedTimeRef.current = 0;

    const nextIndex = currentStepIndex + 1;

    if (nextIndex >= poseSteps.length) {
      const nextSets = Math.min(sets + 1, MAX_DOTS);
      setSets(nextSets);
      setCurrentStepIndex(0);
      setExerciseDesc(poseSteps[0]?.pose_description || '포즈 설명 없음');
      setStep(poseSteps[0]?.step_number || 1);
      setIsStepMatched(false);
      setHasFeedbackPlayed(false);

      if (nextSets >= MAX_DOTS) {
        if (currentExerciseIndex + 1 < exercises.length) {
          setCurrentExerciseIndex(prev => prev + 1);
        } else {
          setShowPopup(true);
          setTimeout(() => {
            navigate('/record');
          }, 3000);
        }
      }
    } else {
      setCurrentStepIndex(nextIndex);
      setExerciseDesc(poseSteps[nextIndex].pose_description);
      setStep(poseSteps[nextIndex].step_number);
      setIsStepMatched(false);
      setHasFeedbackPlayed(false);
    }
  }, [currentStepIndex, poseSteps, sets, currentExerciseIndex, exercises, navigate]);

  // 운동/포즈 설명 로딩
  useEffect(() => {
    const routineId = searchParams.get('routineId');
    
    // URL 파라미터에서 routineId를 찾지 못한 경우 sessionStorage에서 확인
    const finalRoutineId = routineId || sessionStorage.getItem("stretchingRoutineId");
    
    if (!finalRoutineId) {
      console.error('루틴 ID가 없습니다.');
      // 홈으로 리다이렉트
      navigate('/');
      return;
    }

    console.log('사용할 루틴 ID:', finalRoutineId);

    const fetchExerciseAndPoseDesc = async () => {
      try {
        const response = await axios.get(
          `https://v-tune-be.onrender.com/api/routines/${finalRoutineId}/exercises/`
        );

        const exerciseList = response.data.exercises;
        if (Array.isArray(exerciseList) && exerciseList.length > 0) {
          setExercises(exerciseList);

          const currentExercise = exerciseList[currentExerciseIndex];
          setExerciseName(currentExercise?.name || '운동 이름 없음');

          await loadPoseSteps(currentExercise.exercise_id);
        } else {
          setExerciseName('운동 이름 없음');
          setExerciseDesc('포즈 설명 없음');
        }
      } catch (error) {
        console.error('운동 정보 또는 포즈 설명 불러오기 실패:', error);
        setExerciseName('운동 이름 없음');
        setExerciseDesc('포즈 설명 없음');
      }
    };

    fetchExerciseAndPoseDesc();
  }, [searchParams, currentExerciseIndex, navigate]);

  // 포즈 스텝 로딩
  const loadPoseSteps = async (exerciseId: number) => {
    try {
      const poseStepRes = await axios.get(
        `https://v-tune-be.onrender.com/api/data/pose-steps/?exercise_id=${exerciseId}`
      );

      if (Array.isArray(poseStepRes.data) && poseStepRes.data.length > 0) {
        const steps = poseStepRes.data;
        setPoseSteps(steps);

        setExerciseDesc(steps[0].pose_description || '포즈 설명 없음');
        setStep(steps[0].step_number);
        setCurrentStepIndex(0);
        setSets(0);
        setHasFeedbackPlayed(false);

        console.log('총 스텝 수:', steps.length);
        console.log('마지막 스텝 번호:', steps[steps.length - 1].step_number);
      } else {
        setExerciseDesc('포즈 설명 없음');
      }
    } catch (error) {
      console.error('포즈 스텝 불러오기 실패:', error);
      setExerciseDesc('포즈 설명 없음');
    }
  };

  // 결과 처리 & 그리기 & 비교 호출
  const onResults = useCallback(async (results: Results) => {
    if (!results.poseLandmarks) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = webcamRef.current?.video;
    if (!ctx || !canvas || !video) return;

    // 캔버스 사이즈 & 클리어
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 연결선
    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const start = results.poseLandmarks[startIdx];
      const end = results.poseLandmarks[endIdx];
      if (!start || !end) continue;

      ctx.beginPath();
      ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
      ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 포인트
    for (const pt of results.poseLandmarks) {
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#00FF88';
      ctx.fill();
    }

    // 백엔드 호출 조건 (그리기는 항상 진행)
    const currentTime = Date.now();
    const shouldProcessPose = currentTime - lastProcessedTimeRef.current >= PROCESS_INTERVAL;

    if (!shouldProcessPose) return;
    if (isStepMatchedRef.current) return;
    if (isPlayingTTSRef.current) return;

    lastProcessedTimeRef.current = currentTime;
    console.log('15초 간격으로 포즈 분석 실행');

    // 필수 키만 정확한 인덱스로 필터링
    const filteredKeypoints: Record<string, [number, number]> = {};
    for (const name of REQUIRED_KEYS) {
      const idx = (POSE_LANDMARKS as Record<string, number>)[name];
      const lm = results.poseLandmarks[idx];
      if (lm) filteredKeypoints[name] = [lm.x, lm.y];
    }

    try {
      const exIdx = currentExerciseIndexRef.current;
      const currentEx = exercisesRef.current[exIdx];

      if (!currentEx?.exercise_id) {
        console.error('exercise_id가 없어서 백엔드 요청을 건너뜁니다.');
        return;
      }

      const response = await axios.post(
        'https://v-tune-be.onrender.com/api/compare/',
        { keypoints: filteredKeypoints },
        {
          params: {
            exercise_id: currentEx.exercise_id,
            step_number: stepRef.current
          },
          headers: { "Content-Type": "application/json" }
        }
      );

      console.log('백엔드 응답:', response.data);
      const feedbackText =
        response.data.feedback_text ||
        response.data.ck_text ||
        (response.data.match ? "정답입니다" : "자세를 다시 한 번 확인해 주세요");

      if (response.data.match) {
        if (!hasFeedbackPlayedRef.current) {
          hasFeedbackPlayedRef.current = true;
          setHasFeedbackPlayed(true);
          setIsStepMatched(true);

          // 피드백 끝난 뒤 다음 스텝
          enqueueTTS(feedbackText, 'feedback')
            .then(() => setTimeout(moveToNextStep, 500))
            .catch(() => setTimeout(moveToNextStep, 500));
        }
      } else {
        if (!hasFeedbackPlayedRef.current) {
          hasFeedbackPlayedRef.current = true;
          setHasFeedbackPlayed(true);
          enqueueTTS(feedbackText, 'feedback')
            .then(() => {
              setTimeout(() => {
                hasFeedbackPlayedRef.current = false;
                setHasFeedbackPlayed(false);
              }, 2000);
            })
            .catch(() => {
              hasFeedbackPlayedRef.current = false;
              setHasFeedbackPlayed(false);
            });
        }
        console.log('정답이 아닙니다');
      }
    } catch (error) {
      console.error('백엔드 API 오류:', error);
    }
  }, [enqueueTTS, moveToNextStep]);

  // 최신 onResults를 Pose에 연결하기 위한 ref
  const onResultsRef = useRef<(r: Results) => void>(() => {});
  useEffect(() => { onResultsRef.current = onResults; }, [onResults]);

  // Pose는 1회만 생성
  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((res: Results) => onResultsRef.current(res));
    poseRef.current = pose;

    return () => {
      poseRef.current?.close();
      poseRef.current = null;
    };
  }, []);

  // 카메라는 전/후면 전환 시에만 재시작
  useEffect(() => {
    const startCamera = () => {
      if (
        typeof webcamRef.current !== "undefined" &&
        webcamRef.current !== null &&
        webcamRef.current.video !== null &&
        poseRef.current
      ) {
        cameraRef.current = new cam.Camera(webcamRef.current.video!, {
          onFrame: async () => {
            if (poseRef.current && webcamRef.current?.video) {
              await poseRef.current.send({ image: webcamRef.current.video });
            }
          },
          width: 640,
          height: 480,
        });
        cameraRef.current.start();
      }
    };

    startCamera();
    return () => {
      cameraRef.current?.stop();
      cameraRef.current = null;
    };
  }, [facingMode]);

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  }, []);

  // 설명 TTS (중복 방지 + 큐)
  useEffect(() => {
    if (!exerciseDesc) return;

    const currentEx = exercises[currentExerciseIndex];
    const descKey = `${currentEx?.exercise_id ?? 'x'}-${step}-${exerciseDesc}`;
    if (lastDescKeyRef.current === descKey) return; // 같은 설명이면 패스
    lastDescKeyRef.current = descKey;

    const timer = setTimeout(() => {
      enqueueTTS(exerciseDesc, 'description').catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [exerciseDesc, step, currentExerciseIndex, exercises, enqueueTTS]);

  // 언마운트 시 TTS 정리
  useEffect(() => {
    return () => {
      stopAllTTS();
    };
  }, []);

  return (
    <div className="stretch-container">
      <div className="top-bar">
        <button onClick={() => navigate('/')}>
          <img src={prevIcon} alt="Previous" />
        </button>
        <h2>{exerciseName}</h2>
      </div>

      <div className="camera-card" onClick={toggleCamera}>
        <div className="camera-wrapper">
          <Webcam
            key={facingMode}
            ref={webcamRef}
            className="camera"
            videoConstraints={{ facingMode }}
            // 좌우반전(미러링) 미적용
          />
          <canvas
            ref={canvasRef}
            className="pose-canvas"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 2,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          />
          <div className="overlay-box">
            <div className="set-count">
              <div className="dots">
                {[...Array(Math.min(sets, MAX_DOTS))].map((_, i) => (
                  <div key={i} className="dot" />
                ))}
              </div>
              <div className="reps">Step<br />{step}</div>
            </div>
          </div>
          {showPopup && <Popup />}
        </div>
      </div>

      <div className="description-balloon">
        <img src={personIcon} alt="person" className="person-icon" />
        <div className="custom-balloon">
          {exerciseDesc}
          {isPlayingTTS && <div className="playing-indicator">🔊</div>}
        </div>
      </div>
    </div>
  );
};

export default StretchScreen;