import React from 'react';
import clockIcon from '../assets/icons/clock.svg'; 

import '../styles/Popup.css';

const Popup: React.FC = () => {
  return (
    <div className="popup-overlay">
      <div className="popup-card">
        <img src={clockIcon} alt="Clock" className="popup-icon" />
        <div className="popup-score">100</div>
        <div className="popup-message">오늘의 운동을 완료 했어요!</div>
      </div>
    </div>
  );
};

export default Popup;
