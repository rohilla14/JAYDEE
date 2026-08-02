import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { StockPage } from './pages/StockPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/stock" element={<StockPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/stock" replace />} />
        <Route path="*" element={<Navigate to="/stock" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
