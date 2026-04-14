import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface Memory {
  uid: string
  type: string
  content: string
  summary: string
  importanceScore: number
  scopeScore: number
  scope: string
  version: number
  versionChain: string[]
  createdAt: number
  updatedAt: number
  lastAccessed: number
  accessCount: number
  tags: string[]
  metadata: Record<string, any>
}

export interface Profile {
  persona: {
    name: string
    description: string
    traits: string[]
  }
  preferences: {
    communicationStyle: string
    topics: string[]
    format: string
  }
  interactionHistory: Array<{
    timestamp: number
    type: string
    details: any
  }>
}

export interface SystemStats {
  totalMemories: number
  memoriesByType: Record<string, number>
  memoriesByScope: Record<string, number>
  avgImportanceScore: number
  avgScopeScore: number
  dreamingRuns: number
  lastDreamingRun: number | null
}

export const memoryApi = {
  getAll: async (params?: { limit?: number; offset?: number; type?: string; scope?: string }) => {
    const response = await apiClient.get('/memories', { params })
    return response.data
  },

  getById: async (uid: string) => {
    const response = await apiClient.get(`/memories/${uid}`)
    return response.data
  },

  capture: async (content: string) => {
    const response = await apiClient.post('/memories/capture', { content })
    return response.data
  },

  delete: async (uid: string) => {
    const response = await apiClient.delete(`/memories/${uid}`)
    return response.data
  },
}

export const contextApi = {
  recall: async (query: string, options?: any) => {
    const response = await apiClient.post('/context/recall', { query, options })
    return response.data
  },
}

export const dreamingApi = {
  getStatus: async () => {
    const response = await apiClient.get('/dreaming/status')
    return response.data
  },

  start: async () => {
    const response = await apiClient.post('/dreaming/start')
    return response.data
  },

  getHistory: async () => {
    const response = await apiClient.get('/dreaming/history')
    return response.data
  },
}

export const profileApi = {
  get: async () => {
    const response = await apiClient.get('/profile')
    return response.data
  },

  update: async (data: Partial<Profile>) => {
    const response = await apiClient.put('/profile', data)
    return response.data
  },
}

export const systemApi = {
  getStats: async (): Promise<{ success: boolean; data: SystemStats }> => {
    const response = await apiClient.get('/system/stats')
    return response.data
  },

  getStatus: async () => {
    const response = await apiClient.get('/system/status')
    return response.data
  },
}

export default apiClient
