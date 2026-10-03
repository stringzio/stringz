import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import Landing from './pages/Landing'
import Waitlist from './pages/Waitlist'
import Legal from './pages/Legal'
import Onboarding from './pages/Onboarding'
import FullLoader from './components/FullLoader'

// The builder pulls in the wallet stack (wagmi + RainbowKit); load it only on its route.
const AppRoute = lazy(() => import('./pages/AppRoute'))
const AuthRoute = lazy(() => import('./pages/AuthRoute'))
const Admin = lazy(() => import('./pages/Admin'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/waitlist" element={<Waitlist />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        path="/auth"
        element={
          <Suspense fallback={<FullLoader />}>
            <AuthRoute />
          </Suspense>
        }
      />
      <Route path="/privacy" element={<Legal doc="privacy" />} />
      <Route path="/terms" element={<Legal doc="terms" />} />
      <Route
        path="/admin"
        element={
          <Suspense fallback={<FullLoader />}>
            <Admin />
          </Suspense>
        }
      />
      <Route
        path="/app"
        element={
          <Suspense fallback={<FullLoader />}>
            <AppRoute />
          </Suspense>
        }
      />
    </Routes>
  )
}
