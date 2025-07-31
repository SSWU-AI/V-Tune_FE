import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StretchScreen from './components/StretchScreen';
import WorkoutRecordScreen from './components/WorkoutRecordScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StretchScreen />} />
        <Route path="/record" element={<WorkoutRecordScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;