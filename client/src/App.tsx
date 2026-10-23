import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ReaderPage } from './pages/ReaderPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/text/:id" element={<ReaderPage />} />
      <Route
        path="*"
        element={
          <div className="state">
            <p>Такой страницы нет</p>
            <Link className="btn" to="/">
              На главную
            </Link>
          </div>
        }
      />
    </Routes>
  );
}
