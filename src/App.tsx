import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StretchScreen from './components/StretchScreen';
import WorkoutRecordScreen from './components/WorkoutRecordScreen';
import HomeScreen from './components/HomeScreen';
import ChatBotScreen from './components/ChatBotScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatBotScreen />} />
        <Route path="/stretch" element={<StretchScreen />} />
        <Route path="/record" element={<WorkoutRecordScreen />} />
        <Route path="/home" element={<HomeScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;



