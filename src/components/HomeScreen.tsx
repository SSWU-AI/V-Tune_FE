import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import vTuneIcon from '../assets/icons/vtune.svg';
import '../styles/HomeScreen.css';

const routines = [1, 2, 3, 4]; // 카드 4개

const HomeScreen: React.FC = () => {
  const [selected, setSelected] = useState<number | null>(null);
  const navigate = useNavigate();

  const handleCardClick = (index: number) => {
    if (selected === index) {
      setSelected(null); // 다시 누르면 해제
    } else {
      setSelected(index); // 하나만 선택
    }
  };

  const handleStart = () => {
    if (selected !== null) {
      navigate('/stretch');
    }
  };

  return (
    <div className="home-container">
      <img src={vTuneIcon} alt="V-Tune" className="logo" />
      <h2 className="title">먼저 하고 싶은<br />운동 루틴을 선택해 주세요</h2>

      <div className="cards">
        {routines.map((_, index) => (
          <div
            key={index}
            className={`card ${selected === index ? 'selected' : ''}`}
            onClick={() => handleCardClick(index)}
          >
            <p className="card-title">1. 제목</p>
            <p className="card-keywords">#키워드 #키워드</p>
            <ul className="card-list">
              <li>운동 리스트</li>
              <li>운동 리스트</li>
              <li>운동 리스트</li>
              <li>운동 리스트</li>
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
