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
  
  // 음성 관련 상태 추가
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [hasFeedbackPlayed, setHasFeedbackPlayed] = useState(false); // 피드백이 한 번 재생되었는지 체크
  
  // 좌표값 처리 간격 제어를 위한 ref 추가
  const lastProcessedTimeRef = useRef<number>(0);
  const PROCESS_INTERVAL = 15000; // 15초
  
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<cam.Camera | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const [searchParams] = useSearchParams();

  // TTS 음성 관리를 위한 ref
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const descriptionAudioRef = useRef<HTMLAudioElement | null>(null);

  // TTS 재생 함수 
  const playTTS = useCallback(async (text: string, audioType: 'feedback' | 'description' = 'feedback'): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 이미 음성이 재생 중이면 현재 음성 중단 후 새 음성 재생
      if (isPlayingTTS && audioType === 'feedback') {
        stopAllTTS();
      } else if (isPlayingTTS && audioType === 'description') {
        // 설명 음성은 피드백 음성이 재생 중일 때 무시
        return resolve();
      }

      const playAudio = async () => {
        try {
          setIsPlayingTTS(true);

          // 기존에 재생 중인 해당 타입의 음성 중단
          if (audioType === 'feedback' && currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }
          if (audioType === 'description' && descriptionAudioRef.current) {
            descriptionAudioRef.current.pause();
            descriptionAudioRef.current = null;
          }

          const audioContent = await fetchGoogleTTS(text, apiKey);
          if (audioContent) {
            const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
            
            // 음성 타입에 따라 적절한 ref에 저장
            if (audioType === 'description') {
              descriptionAudioRef.current = audio;
            } else {
              currentAudioRef.current = audio;
            }

            // 음성 재생 완료 시 상태 정리
            audio.addEventListener('ended', () => {
              setIsPlayingTTS(false);
              if (audioType === 'description') {
                descriptionAudioRef.current = null;
              } else {
                currentAudioRef.current = null;
              }
              resolve();
            });

            // 음성 재생 에러 시 상태 정리
            audio.addEventListener('error', (error) => {
              setIsPlayingTTS(false);
              if (audioType === 'description') {
                descriptionAudioRef.current = null;
              } else {
                currentAudioRef.current = null;
              }
              reject(error);
            });

            await audio.play();
          } else {
            setIsPlayingTTS(false);
            resolve();
          }
        } catch (error) {
          setIsPlayingTTS(false);
          console.error('TTS 오류:', error);
          reject(error);
        }
      };

      playAudio();
    });
  }, [isPlayingTTS, apiKey]);

  // 모든 TTS 음성 중단 함수
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

  // 다음 스텝으로 이동하는 함수 -> 음성이 끝나고 실행되도록 개선
  const moveToNextStep = useCallback(() => {
    // 새로운 스텝으로 이동할 때 타이머 리셋
    lastProcessedTimeRef.current = 0;
    
    const nextIndex = currentStepIndex + 1;
    // 모든 스텝을 완료한 경우 (한 세트 완료)
    if (nextIndex >= poseSteps.length) {
      if (sets < MAX_DOTS) {
        setSets(prev => prev + 1);
        setCurrentStepIndex(0);
        setExerciseDesc(poseSteps[0]?.pose_description || '포즈 설명 없음');
        setStep(poseSteps[0]?.step_number || 1);
        setIsStepMatched(false);
        setHasFeedbackPlayed(false); // 새 스텝 시작 시 피드백 플래그 리셋
        
        // 3세트 완료 시 다음 운동으로 이동
        if (sets + 1 >= MAX_DOTS) {
          console.log('3세트 완료! 다음 운동으로 이동합니다.');
          if (currentExerciseIndex + 1 < exercises.length) {
            setCurrentExerciseIndex(prev => prev + 1);
          } else {
            console.log('모든 운동 완료! 루틴이 끝났습니다.');
            setShowPopup(true);
            setTimeout(() => {
              navigate('/record');
            }, 3000);
          }
        }
      }
    } else {
      setCurrentStepIndex(nextIndex);
      setExerciseDesc(poseSteps[nextIndex].pose_description);
      setStep(poseSteps[nextIndex].step_number);
      setIsStepMatched(false);
      setHasFeedbackPlayed(false); // 새 스텝 시작 시 피드백 플래그 리셋
    }
  }, [currentStepIndex, poseSteps, sets, currentExerciseIndex, exercises, navigate]);

  //  운동 정보 + 포즈 설명 가져오기
  useEffect(() => {
    const routineId = searchParams.get('routineId');
    if (!routineId) return;

    const fetchExerciseAndPoseDesc = async () => {
      try {
        const response = await axios.get(
          `https://v-tune-be.onrender.com/api/routines/${routineId}/exercises/`
        );

        const exerciseList = response.data.exercises;
        if (Array.isArray(exerciseList) && exerciseList.length > 0) {
          setExercises(exerciseList);
          
          // 현재 운동 (첫 번째 운동)
          const currentExercise = exerciseList[currentExerciseIndex];
          setExerciseName(currentExercise.name || '운동 이름 없음');

          // 포즈 스텝 데이터 가져오기
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
  }, [searchParams, currentExerciseIndex]);

  // 포즈 스텝 데이터를 로드하는 함수
  const loadPoseSteps = async (exerciseId: number) => {
    try {
      const poseStepRes = await axios.get(
        `https://v-tune-be.onrender.com/api/data/pose-steps/?exercise_id=${exerciseId}`
      );

      if (Array.isArray(poseStepRes.data) && poseStepRes.data.length > 0) {
        const steps = poseStepRes.data;
        setPoseSteps(steps);
        
        // 첫 번째 스텝의 설명을 표시
        setExerciseDesc(steps[0].pose_description || '포즈 설명 없음');
        setStep(steps[0].step_number);
        setCurrentStepIndex(0);
        setSets(0); // 새 운동 시작 시 세트 초기화
        setHasFeedbackPlayed(false); // 피드백 플래그 리셋
        
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

  // Mediapipe 초기화 및 카메라 연결
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

    pose.onResults(onResults);
    poseRef.current = pose;

    if (
      typeof webcamRef.current !== "undefined" &&
      webcamRef.current !== null &&
      webcamRef.current.video !== null
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

    return () => {
      cameraRef.current?.stop();
    };
  }, [exercises, currentExerciseIndex, step, poseSteps, currentStepIndex, sets]);

  //  Pose 결과 처리 및 canvas 그리기
  const onResults = async (results: Results) => {
    if (!results.poseLandmarks) return;
    if (isStepMatched) return; // 이미 정답이면 더 이상 compare 호출 안 함
    if (isPlayingTTS) return; // 음성이 재생 중이면 처리하지 않음

    // 15초 간격으로만 백엔드 API 호출하도록 제한
    const currentTime = Date.now();
    const shouldProcessPose = currentTime - lastProcessedTimeRef.current >= PROCESS_INTERVAL;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = webcamRef.current?.video;

    if (!ctx || !canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const start = results.poseLandmarks[startIdx];
      const end = results.poseLandmarks[endIdx];

      ctx.beginPath();
      ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
      ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const pt of results.poseLandmarks) {
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#00FF88';
      ctx.fill();
    }

    // 15초 간격이 아니면 canvas만 그리고 백엔드 API 호출하지 않음
    if (!shouldProcessPose) {
      return;
    }

    // 15초 간격일 때만 백엔드 API 호출
    lastProcessedTimeRef.current = currentTime;
    console.log('15초 간격으로 포즈 분석 실행');

    const keypoints: Record<string, [number, number]> = {};
    results.poseLandmarks.forEach((landmark, index) => {
      const key = Object.keys(POSE_LANDMARKS)[index];
      keypoints[key] = [landmark.x, landmark.y];
    });

    // 백엔드에서 기대하는 키포인트만 필터링하여 전송
    const filteredKeypoints: Record<string, [number, number]> = {};
    const requiredKeys = [
      'NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER',
      'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST',
      'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE',
      'LEFT_ANKLE', 'RIGHT_ANKLE'
    ];

    requiredKeys.forEach(key => {
      if (keypoints[key]) {
        filteredKeypoints[key] = keypoints[key];
      }
    });

    try {
      // exercise_id가 없으면 요청하지 않음
      if (!exercises[currentExerciseIndex]?.exercise_id) {
        console.error('exercise_id가 없어서 백엔드 요청을 건너뜁니다.');
        return;
      }
      
      const response = await axios.post(
        'https://v-tune-be.onrender.com/api/compare/',
        {
          keypoints: filteredKeypoints,
        },
        {
          params: { 
            exercise_id: exercises[currentExerciseIndex].exercise_id, 
            step_number: step 
          },
          headers: { 
            "Content-Type": "application/json" 
          }
        }
      );

      console.log('백엔드 응답:', response.data);

      // 백엔드에서 feedback_text 또는 ck_text 필드가 올 수 있으므로 모두 확인
      const feedbackText = response.data.feedback_text || response.data.ck_text || (response.data.match ? "정답입니다" : "자세를 다시 한 번 확인해 주세요");
      
      if (response.data.match) {
        // 정답일 때: 피드백이 아직 재생되지 않았다면 재생
        if (!hasFeedbackPlayed) {
          setHasFeedbackPlayed(true);
          setIsStepMatched(true); // 해당 step에서 compare 중단
          
          // 정답 피드백 재생 후 다음 스텝으로 이동
          playTTS(feedbackText, 'feedback')
            .then(() => {
              // 음성 재생이 완료된 후 다음 스텝으로 이동
              setTimeout(moveToNextStep, 500);
            })
            .catch((error) => {
              console.error('피드백 TTS 재생 오류:', error);
              // 오류가 발생해도 다음 스텝으로 이동
              setTimeout(moveToNextStep, 500);
            });
        }
      } else {
        // 오답일 때: 피드백 음성만 재생 (한 번만)
        if (!hasFeedbackPlayed) {
          setHasFeedbackPlayed(true);
          playTTS(feedbackText, 'feedback')
            .then(() => {
              // 오답 피드백 후 다시 시도할 수 있도록 플래그 리셋
              setTimeout(() => {
                setHasFeedbackPlayed(false);
              }, 2000); // 2초 후 다시 피드백 가능
            })
            .catch((error) => {
              console.error('피드백 TTS 재생 오류:', error);
              setHasFeedbackPlayed(false);
            });
        }
        console.log('정답이 아닙니다');
      }
    } catch (error) {
      console.error('백엔드 API 오류:', error);
    }
  };

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  }, []);

  // exerciseDesc가 바뀔 때마다 Google TTS로 읽어주기
  useEffect(() => {
    if (!exerciseDesc) return;
    let isCancelled = false;

    const speak = () => {
      // 기존 설명 음성이 재생 중이면 중단
      if (descriptionAudioRef.current) {
        descriptionAudioRef.current.pause();
        descriptionAudioRef.current = null;
      }

      if (!isCancelled && !isPlayingTTS) {
        playTTS(exerciseDesc, 'description').catch((error) => {
          console.error('TTS 오류:', error);
        });
      }
    };

    // 약간의 딜레이를 두어 상태가 안정화된 후 실행
    const timer = setTimeout(speak, 500);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [exerciseDesc, playTTS, isPlayingTTS]);

  // 컴포넌트 언마운트 시 모든 음성 정리
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
            ref={webcamRef}
            className="camera"
            videoConstraints={{ facingMode }}
            mirrored={true}
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