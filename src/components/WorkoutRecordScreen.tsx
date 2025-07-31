import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import excard from '../assets/icons/excard.svg';
import '../styles/WorkoutRecordScreen.css';

const exercises = [
  { name: '스트레칭', sets: 2, score: 100 },
  { name: '런지', sets: 3, score: 85 },
  { name: '플랭크', sets: 3, score: 30 },
  { name: '사이드 레그 레이즈', sets: 1, score: 70 },
];

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours()}시 ${now.getMinutes()}분`;
}

const WorkoutRecordScreen: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const handleSaveRecord = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setPhoto(imageSrc);

        // 이미지 다운로드
        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = `workout_${Date.now()}.png`;
        link.click();
      }
    }
  };

  return (
    <div className="workout-record-root">
      <div className="workout-header">
        <span className="workout-title">멋진 기록을 자랑해주세요!</span>
      </div>
      <div className="workout-card">
        <div className="workout-card-title">V-Tune</div>
        <div className="workout-date">{getTodayString()}</div>
        <div className="workout-list">
          {exercises.map((ex, idx) => (
            <div className="workout-row" key={ex.name + idx}>
              <img src={excard} alt="운동 아이콘" className="workout-icon" />
              <div className="workout-info">
                <div className="workout-name">{ex.name}</div>
                <div className="workout-sets">{ex.sets} 세트</div>
              </div>
              <div className="workout-score">
                <span>{ex.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="workout-actions">
        <button className="save-btn" onClick={handleSaveRecord}>운동 기록 저장</button>
        <button className="end-btn">운동 끝내기</button>
      </div>
      {/* 웹캠은 숨겨진 상태로 캡처만 사용 */}
      <Webcam ref={webcamRef} screenshotFormat="image/png" style={{ display: 'none' }} />
      {/* 저장된 사진 미리보기(선택) */}
      {photo && (
        <div className="photo-preview">
          <img src={photo} alt="운동 사진" />
        </div>
      )}
    </div>
  );
};

export default WorkoutRecordScreen;