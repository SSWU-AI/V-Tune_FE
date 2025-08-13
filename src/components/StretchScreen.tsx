import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchGoogleTTS } from '../api/googleTTS';
const apiKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY;
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Webcam from 'react-webcam';
import { Pose, POSE_LANDMARKS, POSE_CONNECTIONS } from '@mediapipe/pose';
import type { Results, Landmark } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import '../styles/StretchScreen.css';

import prevIcon from '../assets/icons/prev.svg';
import personIcon from '../assets/icons/person.svg';
import Popup from './Popup';

const MAX_DOTS = 3;

// 타이밍 설정
const POSE_WAIT_TIME = 10000;       // 10초 - 운동 설명 후 자세 대기
const NEXT_STEP_WAIT_TIME = 3000;   // 3초 - (정답) 피드백 후 다음 스텝 대기

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
  
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [currentPhase, setCurrentPhase] =
    useState<'loading' | 'description' | 'waiting' | 'feedback' | 'moving'>('loading');

  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<cam.Camera | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const [searchParams] = useSearchParams();

  // 타이머/오디오/랜드마크
  const poseWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextStepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const latestLandmarksRef = useRef<Landmark[] | null>(null);
  const isProcessingRef = useRef(false); // 평가 중복 방지

  // 타이머 정리
  const clearAllTimers = useCallback(() => {
    if (poseWaitTimerRef.current) {
      clearTimeout(poseWaitTimerRef.current);
      poseWaitTimerRef.current = null;
    }
    if (nextStepTimerRef.current) {
      clearTimeout(nextStepTimerRef.current);
      nextStepTimerRef.current = null;
    }
  }, []);

  // TTS 정지
  const stopTTS = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsPlayingTTS(false);
  }, []);

  // TTS 재생
  const playTTS = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim() || !apiKey) return false;

    return new Promise((resolve) => {
      // 이전 오디오 종료 (다음 스텝 설명이 끊기지 않도록 moveToNextStep 전에만 호출됨)
      stopTTS();
      setIsPlayingTTS(true);

      fetchGoogleTTS(text, apiKey)
        .then((audioContent) => {
          if (!audioContent) {
            setIsPlayingTTS(false);
            resolve(false);
            return;
          }
          const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
          currentAudioRef.current = audio;

          const handleEnded = () => {
            setIsPlayingTTS(false);
            currentAudioRef.current = null;
            resolve(true);
          };
          const handleError = () => {
            setIsPlayingTTS(false);
            currentAudioRef.current = null;
            resolve(false);
          };

          audio.addEventListener('ended', handleEnded);
          audio.addEventListener('error', handleError);
          audio.play().catch(handleError);
        })
        .catch(() => {
          setIsPlayingTTS(false);
          resolve(false);
        });
    });
  }, [apiKey, stopTTS]);

  // === 3단계: 다음 스텝으로 이동 (먼저 선언!) ===
  const moveToNextStep = useCallback(() => {
    if (isProcessingRef.current) return;

    setCurrentPhase('loading');
    clearAllTimers();
    stopTTS(); // 이전 피드백이 끝난 상태에서 안전 정리
    latestLandmarksRef.current = null;

    const nextIndex = currentStepIndex + 1;

    if (nextIndex >= poseSteps.length) {
      const nextSets = Math.min(sets + 1, MAX_DOTS);
      setSets(nextSets);
      setCurrentStepIndex(0);
      setStep(poseSteps[0]?.step_number || 1);
      if (poseSteps.length > 0) {
        setExerciseDesc(poseSteps[0].pose_description || '포즈 설명 없음');
      }

      if (nextSets >= MAX_DOTS) {
        if (currentExerciseIndex + 1 < exercises.length) {
          setCurrentExerciseIndex(prev => prev + 1);
          setSets(0); // 새 운동 시작
          return;
        } else {
          setShowPopup(true);
          setTimeout(() => navigate('/record'), 3000);
          return;
        }
      }
    } else {
      setCurrentStepIndex(nextIndex);
      setStep(poseSteps[nextIndex].step_number);
      if (poseSteps[nextIndex]) {
        setExerciseDesc(poseSteps[nextIndex].pose_description || '포즈 설명 없음');
      }
    }
  }, [clearAllTimers, stopTTS, currentStepIndex, poseSteps, sets, currentExerciseIndex, exercises, navigate]);

  // 1단계: 운동 설명
  const startDescriptionPhase = useCallback(async () => {
    if (!exerciseDesc || exerciseDesc === '포즈 설명을 불러오는 중입니다...') return;

    setCurrentPhase('description');
    clearAllTimers();
    latestLandmarksRef.current = null;

    await playTTS(exerciseDesc);
    // 설명 끝났으면 10초 대기 시작
    setCurrentPhase('waiting');
    poseWaitTimerRef.current = setTimeout(() => {
      evaluatePoseAndGiveFeedback();
    }, POSE_WAIT_TIME);
  }, [exerciseDesc, clearAllTimers, playTTS]);

  // 2단계: 자세 평가 & 피드백 (오답이면 10초 대기 반복, 정답이면 3초 후 다음)
  const evaluatePoseAndGiveFeedback = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    setCurrentPhase('feedback');
    clearAllTimers();

    const requeueWait = () => {
      // 오답/미인식/오류 → 10초 후 다시 평가 루프
      setCurrentPhase('waiting');
      latestLandmarksRef.current = null; // 새로 캡처하도록 리셋
      isProcessingRef.current = false;   // 평가 가능 상태 복구
      poseWaitTimerRef.current = setTimeout(() => {
        evaluatePoseAndGiveFeedback();
      }, POSE_WAIT_TIME);
    };

    try {
      let feedbackText = '';

      if (!latestLandmarksRef.current) {
        feedbackText = '카메라에서 자세를 인식하지 못했어요. 다시 한 번 자세를 잡아볼게요.';
        await playTTS(feedbackText);
        requeueWait();
        return;
      }

      // 키포인트 구성
      const filteredKeypoints: Record<string, [number, number]> = {};
      for (const name of REQUIRED_KEYS) {
        const idx = (POSE_LANDMARKS as any)[name];
        const lm = latestLandmarksRef.current[idx];
        if (lm) filteredKeypoints[name] = [lm.x, lm.y];
      }

      const currentEx = exercises[currentExerciseIndex];
      if (!currentEx?.exercise_id) {
        await playTTS('운동 정보를 불러오지 못했어요. 다시 시도해볼게요.');
        requeueWait();
        return;
      }

      const response = await axios.post(
        'https://v-tune-be.onrender.com/api/compare/',
        { keypoints: filteredKeypoints },
        {
          params: { exercise_id: currentEx.exercise_id, step_number: step },
          headers: { "Content-Type": "application/json" },
          timeout: 8000
        }
      );

      const match = !!response.data?.match;
      feedbackText = response.data.feedback_text ||
                     response.data.ck_text ||
                     (match ? "완벽해요! 자세가 정확합니다!" : "조금만 더! 방금 안내한 부분을 신경 써주세요.");

      await playTTS(feedbackText);

      if (match) {
        // 정답 → 3초 대기 후 다음 단계
        setCurrentPhase('moving');
        isProcessingRef.current = false;
        nextStepTimerRef.current = setTimeout(() => {
          moveToNextStep();
        }, NEXT_STEP_WAIT_TIME);
      } else {
        // 오답 → 다시 10초 대기 후 재평가
        requeueWait();
      }
    } catch (e) {
      await playTTS('네트워크 문제로 비교를 완료하지 못했어요. 다시 시도해볼게요.');
      requeueWait();
    }
  }, [exercises, currentExerciseIndex, step, playTTS, clearAllTimers, moveToNextStep]);

  // 설명이 준비되면 자동 시작
  useEffect(() => {
    if (currentPhase === 'loading' && exerciseDesc && exerciseDesc !== '포즈 설명을 불러오는 중입니다...') {
      const t = setTimeout(() => startDescriptionPhase(), 400);
      return () => clearTimeout(t);
    }
  }, [currentPhase, exerciseDesc, startDescriptionPhase]);

  // 운동/스텝 데이터 로딩
  useEffect(() => {
    const routineId = searchParams.get('routineId');
    if (!routineId) return;

    const fetchData = async () => {
      try {
        const response = await axios.get(
          `https://v-tune-be.onrender.com/api/routines/${routineId}/exercises/`
        );
        const exerciseList = response.data.exercises;
        if (Array.isArray(exerciseList) && exerciseList.length > 0) {
          setExercises(exerciseList);
          const currentExercise = exerciseList[currentExerciseIndex];
          setExerciseName(currentExercise?.name || '운동 이름 없음');
          await loadPoseSteps(currentExercise.exercise_id);
        }
      } catch (error) {
        console.error('[DATA] 로딩 실패:', error);
      }
    };

    fetchData();
  }, [searchParams, currentExerciseIndex]);

  const loadPoseSteps = async (exerciseId: number) => {
    try {
      const response = await axios.get(
        `https://v-tune-be.onrender.com/api/data/pose-steps/?exercise_id=${exerciseId}`
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        const steps = response.data;
        setPoseSteps(steps);
        setCurrentStepIndex(0);
        setStep(steps[0].step_number);
        setExerciseDesc(steps[0].pose_description || '포즈 설명 없음');
        setCurrentPhase('loading');
        if (currentExerciseIndex > 0) setSets(0);
      }
    } catch (error) {
      console.error('[DATA] 포즈 스텝 로딩 실패:', error);
    }
  };

  // Pose 결과 처리 (스켈레톤만)
  const onResults = useCallback(async (results: Results) => {
    if (!results.poseLandmarks) return;

    if (currentPhase === 'waiting') {
      latestLandmarksRef.current = results.poseLandmarks;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = webcamRef.current?.video;
    if (!ctx || !canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#6d88e8ff';
    ctx.lineWidth = 2;
    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const start = results.poseLandmarks[startIdx];
      const end = results.poseLandmarks[endIdx];
      if (!start || !end) continue;
      ctx.beginPath();
      ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
      ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#6d88e8ff';
    for (const pt of results.poseLandmarks) {
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [currentPhase]);

  // Pose 설정
  const onResultsRef = useRef<(r: Results) => void>(() => {});
  useEffect(() => { onResultsRef.current = onResults; }, [onResults]);

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

  // 카메라
  useEffect(() => {
    const startCamera = () => {
      if (webcamRef.current?.video && poseRef.current) {
        cameraRef.current = new cam.Camera(webcamRef.current.video, {
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

  // 언마운트 정리
  useEffect(() => {
    return () => {
      clearAllTimers();
      stopTTS();
    };
  }, [clearAllTimers, stopTTS]);

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
          <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
            상태: {currentPhase === 'description' ? '설명 중' : 
                  currentPhase === 'waiting' ? '자세 대기 중' :
                  currentPhase === 'feedback' ? '피드백 중' :
                  currentPhase === 'moving' ? '다음 단계 준비 중' : '로딩 중'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StretchScreen;