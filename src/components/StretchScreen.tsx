import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
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
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user"); // 전/후면 상태

  const navigate = useNavigate();

  // 전/후면 카메라 토글 함수
  const toggleCamera = useCallback(() => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  }, []);

  // Reps 증가 로직 -> API 개발 후 수정 예정
  useEffect(() => {
    const interval = setInterval(() => {
      setReps(prev => {
        if (prev >= 40) {
          setSets(s => (s < MAX_DOTS ? s + 1 : MAX_DOTS));
          return 1;
        }
        return prev + 1;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // 1분 후 팝업 띄우기 및 페이지 이동
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
        <h2>캣카우 스트레칭</h2>
        <button><img src={nextIcon} alt="Next" /></button>
      </div>

      {/* 카메라 카드 클릭 시 전/후면 전환 */}
      <div className="camera-card" onClick={toggleCamera}>
        <div className="camera-wrapper">
          <Webcam
            className="camera"
            videoConstraints={{
              facingMode: facingMode,
            }}
          />
          <div className="overlay-box">
            <div className="set-count">
              <div className="dots">
                {[...Array(sets > MAX_DOTS ? MAX_DOTS : sets)].map((_, i) => (
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
          척추를 천천히 아래로 눌렀다가 위로 둥글게 말며 호흡에 맞춰 반복하세요.
        </div>
      </div>
    </div>
  );
};

export default StretchScreen;
