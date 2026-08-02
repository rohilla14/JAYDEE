import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { CounterPage } from './pages/CounterPage'
import { LoginPage } from './pages/LoginPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/counter" element={<CounterPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/counter" replace />} />
        <Route path="*" element={<Navigate to="/counter" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
