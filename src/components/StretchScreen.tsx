import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fetchGoogleTTS } from '../api/googleTTS';
import ttsKey from '../../tts-key.json';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Webcam from 'react-webcam';
import { Pose, POSE_LANDMARKS, POSE_CONNECTIONS } from '@mediapipe/pose';
import type { Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import '../styles/StretchScreen.css';

import prevIcon from '../assets/icons/prev.svg';
import nextIcon from '../assets/icons/next.svg';
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
  
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<cam.Camera | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const [searchParams] = useSearchParams();

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
  }, []);

  //  Pose 결과 처리 및 canvas 그리기
  const onResults = async (results: Results) => {
    if (!results.poseLandmarks) return;

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

    const keypoints: Record<string, [number, number]> = {};
    results.poseLandmarks.forEach((landmark, index) => {
      const key = Object.keys(POSE_LANDMARKS)[index];
      keypoints[key] = [landmark.x, landmark.y];
    });

    try {
      console.log('백엔드로 전송하는 keypoints:', keypoints);
      
      const response = await axios.post('https://v-tune-be.onrender.com/api/compare/', {
        keypoints,
      });

      console.log('백엔드 응답:', response.data);

      if (response.data.match) {
        const nextIndex = currentStepIndex + 1;
        
        // 모든 스텝을 완료한 경우 (한 세트 완료)
        if (nextIndex >= poseSteps.length) {
          if (sets < MAX_DOTS) {
            // 세트 수 증가하고 첫 번째 스텝으로 리셋
            setSets(prev => prev + 1);
            setCurrentStepIndex(0);
            setExerciseDesc(poseSteps[0]?.pose_description || '포즈 설명 없음');
            setStep(poseSteps[0]?.step_number || 1);
            
            // 3세트 완료 시 다음 운동으로 이동
            if (sets + 1 >= MAX_DOTS) {
              console.log('3세트 완료! 다음 운동으로 이동합니다.');
              
              // 다음 운동이 있는지 확인
              if (currentExerciseIndex + 1 < exercises.length) {
                // 다음 운동으로 이동
                setCurrentExerciseIndex(prev => prev + 1);
              } else {
                // 모든 운동 완료
                console.log('모든 운동 완료! 루틴이 끝났습니다.');
                setShowPopup(true);
                setTimeout(() => {
                  navigate('/record');
                }, 3000);
              }
            }
          }
        } else {
          // 다음 스텝으로 진행
          setCurrentStepIndex(nextIndex);
          setExerciseDesc(poseSteps[nextIndex].pose_description);
          setStep(poseSteps[nextIndex].step_number);
        }
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
    let audio: HTMLAudioElement | null = null;
    let isCancelled = false;

    const speak = async () => {
      try {
        const audioContent = await fetchGoogleTTS(exerciseDesc, ttsKey.apiKey);
        if (audioContent && !isCancelled) {
          // 기존 오디오 중단
          if (audio) {
            audio.pause();
            audio = null;
          }
          audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
          audio.play();
        }
      } catch (e) {
        console.error('TTS 오류:', e);
      }
    };
    speak();
    return () => {
      isCancelled = true;
      if (audio) {
        audio.pause();
        audio = null;
      }
    };
  }, [exerciseDesc]);

  return (
    <div className="stretch-container">
      <div className="top-bar">
        <button><img src={prevIcon} alt="Previous" /></button>
        <h2>{exerciseName}</h2>
        <button><img src={nextIcon} alt="Next" /></button>
      </div>

      <div className="camera-card" onClick={toggleCamera}>
        <div className="camera-wrapper">
          <Webcam
            ref={webcamRef}
            className="camera"
            videoConstraints={{ facingMode }}
            mirrored={false}
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
        </div>
      </div>
    </div>
  );
};

export default StretchScreen;