import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Host from './pages/Host';
import Viewer from './pages/Viewer';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/host" element={<Host />} />
      <Route path="/viewer" element={<Viewer />} />
    </Routes>
  );
}
