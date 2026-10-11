import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '../src/auth/AuthContext'
import { ProtectedRoute } from '../src/auth/ProtectedRoute'
import { api } from '../src/services/api'

function Controls() {
  const auth=useAuth()
  const safe=(operation:Promise<unknown>)=>{void operation.catch(()=>{})}
  return <div>
    <button onClick={()=>safe(auth.login('a@example.test','Synthetic8!'))}>Login A</button>
    <button onClick={()=>safe(auth.login('b@example.test','Synthetic8!'))}>Login B</button>
    <button onClick={auth.logout}>Logout</button>
    <button onClick={()=>safe(api.get('/clients'))}>Request</button>
    <button onClick={()=>safe(auth.refreshUser())}>Refresh</button>
  </div>
}
function Private(){const {user}=useAuth();const [mountedAccount]=React.useState(user?.fullName);return <p data-testid="private">Private {user?.fullName}; mounted {mountedAccount}</p>}
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><Controls/><Routes>
  <Route element={<ProtectedRoute/>}><Route path="/tests/session-security.html" element={<Private/>}/></Route>
  <Route path="/login" element={<p>Signed out</p>}/>
</Routes></AuthProvider></BrowserRouter>)
