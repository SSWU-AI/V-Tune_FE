import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import vTuneIcon from '../assets/icons/vtune.svg';
import '../styles/HomeScreen.css';

const routines = [
  {
    title: '척추 유연성 루틴',
    keywords: ['자세 교정', '후굴', '긴장 완화'],
    exercises: ['낙타 자세', '쟁기 자세', '아기 자세', '상향 플랭크 자세'],
  },
  {
    title: '몸통 비틀기 루틴',
    keywords: ['측면 스트레칭', '소화 촉진', '균형감각'],
    exercises: ['전굴 자세', '비틀린 무릎-머리 닿기 자세', '비틀린 반다리 벌리기 전굴 자세', '비틀린 삼각자세'],
  },
  {
    title: '전신 이완 루틴',
    keywords: ['햄스트링', '요통 완화', '호흡 안정'],
    exercises: ['엄지발가락 잡기 자세', '고양이 자세', '메뚜기 자세', '무한 자세'],
  },
  {
    title: '하체 강화 루틴',
    keywords: ['고관절', '소화 기능', '근력 강화'],
    exercises: ['브릿지 자세', '스쿼트 자세', '아기 자세', '상향 플랭크 자세'],
  },
];

const HomeScreen: React.FC = () => {
  const [selected, setSelected] = useState<number | null>(null);
  const navigate = useNavigate();

  const handleCardClick = (index: number) => {
    setSelected(prev => (prev === index ? null : index));
  };

  const handleStart = () => {
    if (selected !== null) {
      // ✅ 루틴 ID를 URL 파라미터로 전달
      navigate(`/stretch?routineId=${selected + 1}`);
    }
  };

  return (
    <div className="home-container">
      <img src={vTuneIcon} alt="V-Tune" className="logo" />
      <h2 className="title">먼저 하고 싶은<br />운동 루틴을 선택해 주세요</h2>

      <div className="cards">
        {routines.map((routine, index) => (
          <div
            key={index}
            className={`card ${selected === index ? 'selected' : ''}`}
            onClick={() => handleCardClick(index)}
          >
            <p className="card-title">{index + 1}. {routine.title}</p>
            <p className="card-keywords">
              {routine.keywords.map((kw, i) => `#${kw}${i < routine.keywords.length - 1 ? ' ' : ''}`)}
            </p>
            <ul className="card-list">
              {routine.exercises.map((exercise, i) => (
                <li key={i}>{exercise}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button
        className={`start-button ${selected !== null ? 'active' : ''}`}
        onClick={handleStart}
        disabled={selected === null}
      >
        시작하기
      </button>
    </div>
  );
};

export default HomeScreen;
