import React, { useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import '../styles/StretchScreen.css';
import prevIcon from '../assets/icons/prev.svg';
import nextIcon from '../assets/icons/next.svg';
import personIcon from '../assets/icons/person.svg';

const MAX_DOTS = 3;

const StretchScreen: React.FC = () => {
  const [reps, setReps] = useState(0);
  const [sets, setSets] = useState(1);

  // 3초마다 Reps 증가, 점(dot)은 3개까지만
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

  return (
    <div className="stretch-container">
      <div className="top-bar">
        <button><img src={prevIcon} alt="Previous" /></button>
        <h2>캣카우 스트레칭</h2>
        <button><img src={nextIcon} alt="Next" /></button>
      </div>

      <div className="camera-wrapper">
        <Webcam className="camera" mirrored />
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