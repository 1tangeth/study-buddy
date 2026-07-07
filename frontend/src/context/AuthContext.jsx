import { createContext, useContext, useEffect, useState } from 'react'
import {
  clearAccessToken,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  refreshAccessToken,
  register as apiRegister,
  setAccessToken,
} from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = logged out

  // On mount: try to restore session via refresh cookie
  useEffect(() => {
    refreshAccessToken().then(async (token) => {
      if (token) {
        setAccessToken(token)
        const me = await fetchMe()
        setUser(me)
      } else {
        setUser(null)
      }
    })
  }, [])

  async function register(email, password, displayName) {
    const { access_token, user: u } = await apiRegister(email, password, displayName)
    setAccessToken(access_token)
    setUser(u)
  }

  async function login(email, password) {
    const { access_token, user: u } = await apiLogin(email, password)
    setAccessToken(access_token)
    setUser(u)
  }

  async function logout() {
    await apiLogout()
    clearAccessToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
