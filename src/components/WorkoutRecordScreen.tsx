import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Webcam from 'react-webcam';
import stretchIcon from '../assets/icons/stretch.svg';
import lungeIcon from '../assets/icons/lunge.svg';
import plankIcon from '../assets/icons/plank.svg';
import sidelegIcon from '../assets/icons/sideleg.svg';
import vTuneIcon from '../assets/icons/vtune.svg'; 
import scoreCircleIcon from '../assets/icons/score-circle.svg'; 
import '../styles/WorkoutRecordScreen.css';

interface Exercise {
  exercise_id: number;
  name: string;
  description: string;
  repetition: number;
  order: number;
}

interface ExerciseRecord {
  name: string;
  sets: number;
  score: number;
  icon: string;
}



// 점수 생성 함수 (실제로는 백엔드에서 받아와야 할 데이터)
const generateRandomScore = (): number => {
  return Math.floor(Math.random() * 41) + 60; // 60-100 사이의 랜덤 점수
};

// 아이콘 배열 (순서대로 적용)
const exerciseIcons = [stretchIcon, lungeIcon, plankIcon, sidelegIcon];

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 `;
}

const WorkoutRecordScreen: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  // 운동 데이터 가져오기
  useEffect(() => {
    const fetchExercises = async () => {
      try {
        setLoading(true);
        const routineId = searchParams.get('routineId') || '1'; // 기본값 1
        
        const response = await axios.get(
          `https://v-tune-be.onrender.com/api/routines/${routineId}/exercises/`
        );

        const exerciseList: Exercise[] = response.data.exercises;
        
        if (Array.isArray(exerciseList) && exerciseList.length > 0) {
          const exerciseRecords: ExerciseRecord[] = exerciseList.map((exercise, index) => ({
            name: exercise.name,
            sets: 3, // 세트수를 3개로 고정
            score: generateRandomScore(), // 실제로는 백엔드에서 점수를 받아와야 함
            icon: exerciseIcons[index % exerciseIcons.length] // 순서대로 아이콘 적용
          }));
          
          setExercises(exerciseRecords);
        } else {
          // 기본 데이터 (백엔드 응답이 없을 경우)
          setExercises([
            { name: '운동 없음', sets: 0, score: 0, icon: stretchIcon }
          ]);
        }
      } catch (error) {
        console.error('운동 정보 불러오기 실패:', error);
        // 에러 시 기본 데이터
        setExercises([
          { name: '스트레칭', sets: 3, score: 100, icon: stretchIcon },
          { name: '런지', sets: 3, score: 85, icon: lungeIcon },
          { name: '플랭크', sets: 3, score: 30, icon: plankIcon },
          { name: '사이드 레그 레이즈', sets: 3, score: 70, icon: sidelegIcon },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchExercises();
  }, [searchParams]);

  const handleSaveRecord = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setPhoto(imageSrc);

        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = `workout_${Date.now()}.png`;
        link.click();
      }
    }
  };

  if (loading) {
    return (
      <div className="workout-record-root">
        <div className="workout-header">
          <span className="workout-title">운동 기록을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="workout-record-root">
      <div className="workout-header">
        <span className="workout-title">멋진 기록을 자랑해주세요!</span>
      </div>

      <div className="workout-card">
        <img src={vTuneIcon} alt="V-Tune 로고" className="vtune-logo" />
        <div className="workout-date">{getTodayString()}</div>

        <div className="workout-list">
          {exercises.map((ex, idx) => (
            <div className="workout-row" key={ex.name + idx}>
              <img src={ex.icon} alt={`${ex.name} 아이콘`} className="workout-icon" />
              <div className="workout-info">
                <div className="workout-name">{ex.name}</div>
                <div className="workout-sets">{ex.sets} 세트</div>
              </div>
              <div className="workout-score-icon">
                <img src={scoreCircleIcon} alt="점수 원 아이콘" className="score-circle" />
                <span className="score-text">{ex.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="workout-actions">
        <button className="save-btn" onClick={handleSaveRecord}>운동 기록 저장</button>
        <button className="end-btn">운동 끝내기</button>
      </div>

      <Webcam ref={webcamRef} screenshotFormat="image/png" style={{ display: 'none' }} />

      {photo && (
        <div className="photo-preview">
          <img src={photo} alt="운동 사진" />
        </div>
      )}
    </div>
  );
};

export default WorkoutRecordScreen;