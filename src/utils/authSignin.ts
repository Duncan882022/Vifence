import type { AxiosInstance } from 'axios'

function usernameCandidates(username: string): string[] {
  const normalized = username.trim()
  const aliases: string[] = [normalized]

  if (normalized === 'admin') aliases.push('admin123')
  else if (normalized === 'admin123') aliases.push('admin')

  return [...new Set(aliases)]
}

export async function signinWithAliases(
  client: AxiosInstance,
  username: string,
  password: string,
) {
  for (const candidate of usernameCandidates(username)) {
    try {
      const response = await client.post('/auth/signin', {
        username: candidate,
        password,
      })
      return response.data
    } catch {
      // thử alias tiếp theo
    }
  }
  return null
}
