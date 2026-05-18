import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { getToken } from "./lib/api"
import Layout from "./components/Layout"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import UserList from "./pages/users/UserList"
import UserDetail from "./pages/users/UserDetail"
import ProjectList from "./pages/projects/ProjectList"
import QueueMonitor from "./pages/ingest/QueueMonitor"
import SystemSettings from "./pages/system/SystemSettings"

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/users" element={<UserList />} />
                  <Route path="/users/:id" element={<UserDetail />} />
                  <Route path="/projects" element={<ProjectList />} />
                  <Route path="/ingest" element={<QueueMonitor />} />
                  <Route path="/system" element={<SystemSettings />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
