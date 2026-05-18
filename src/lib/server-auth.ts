const TOKEN_KEY = "llmwiki_server_token"

export function getServerToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setServerToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearServerToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
