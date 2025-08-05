import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StretchScreen from './components/StretchScreen';
import WorkoutRecordScreen from './components/WorkoutRecordScreen';
import HomeScreen from './components/HomeScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/stretch" element={<StretchScreen />} />
        <Route path="/record" element={<WorkoutRecordScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
