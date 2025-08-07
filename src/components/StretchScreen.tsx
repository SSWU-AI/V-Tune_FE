import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

const StretchScreen: React.FC = () => {
  const [reps, setReps] = useState(0);
  const [sets, setSets] = useState(1);
  const [showPopup, setShowPopup] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [exerciseName, setExerciseName] = useState('로딩 중...');
  const [exerciseDesc, setExerciseDesc] = useState('운동 설명을 불러오는 중입니다...');

  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<cam.Camera | null>(null);
  const poseRef = useRef<Pose | null>(null);

  // 운동 정보 불러오기
  useEffect(() => {
    const fetchExerciseInfo = async () => {
      try {
        const response = await axios.get('https://v-tune-be.onrender.com/api/data/exercises/');
        const data = response.data[9];
        if (data) {
          setExerciseName(data.name || '운동 이름 없음');
          setExerciseDesc(data.description || '운동 설명 없음');
        } else {
          setExerciseName('운동 이름 없음');
          setExerciseDesc('운동 설명 없음');
        }
      } catch (error) {
        console.error('운동 정보 불러오기 실패:', error);
        setExerciseName('운동 이름 없음');
        setExerciseDesc('운동 설명 없음');
      }
    };
    fetchExerciseInfo();
  }, []);

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

  // Pose 결과 처리 및 canvas에 그리기
  const onResults = async (results: Results) => {
    if (!results.poseLandmarks) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = webcamRef.current?.video;

    if (!ctx || !canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connections
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

    // Draw keypoints
    for (const pt of results.poseLandmarks) {
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#00FF88';
      ctx.fill();
    }

    // Keypoints → 백엔드 전송
    const keypoints: Record<string, [number, number]> = {};
    results.poseLandmarks.forEach((landmark, index) => {
      const key = Object.keys(POSE_LANDMARKS)[index];
      keypoints[key] = [landmark.x, landmark.y];
    });

    try {
      const response = await axios.post('https://v-tune-be.onrender.com/api/compare/', {
        keypoints,
      });

      if (response.data.match) {
        setReps(prev => {
          if (prev + 1 >= 40) {
            if (sets < MAX_DOTS) {
              setSets(s => s + 1);
            }
            return 1;
          }
          return prev + 1;
        });
      }
    } catch (error) {
      console.error('백엔드 API 오류:', error);
    }
  };

  // 카메라 전환
  const toggleCamera = useCallback(() => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  }, []);

  // 1분 후 팝업 + 이동
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPopup(true);
      setTimeout(() => {
        navigate('/record');
      }, 3000);
    }, 60000);
    return () => clearTimeout(timer);
  }, [navigate]);

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
              <div className="reps">Reps<br />{reps}</div>
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
