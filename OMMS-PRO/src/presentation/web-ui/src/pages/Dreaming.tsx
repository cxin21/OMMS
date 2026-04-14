import { useEffect, useState } from 'react'
import { dreamingApi } from '../api/client'

function Dreaming() {
  const [status, setStatus] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    loadStatus()
    loadHistory()
  }, [])

  const loadStatus = async () => {
    try {
      const result = await dreamingApi.getStatus()
      if (result.success) {
        setStatus(result.data)
      }
    } catch (err) {
      console.error('获取梦境状态失败', err)
    }
  }

  const loadHistory = async () => {
    try {
      const result = await dreamingApi.getHistory()
      if (result.success) {
        setHistory(result.data.history || [])
      }
    } catch (err) {
      console.error('获取梦境历史失败', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    try {
      setStarting(true)
      const result = await dreamingApi.start()
      if (result.success) {
        await loadStatus()
        await loadHistory()
      }
    } catch (err) {
      console.error('启动梦境失败', err)
    } finally {
      setStarting(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div>
      <div className="card">
        <h2>🌙 梦境引擎</h2>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
            <button
              className="button"
              onClick={handleStart}
              disabled={starting || status?.isRunning}
            >
              {starting ? '启动中...' : status?.isRunning ? '运行中...' : '启动梦境'}
            </button>
            <span style={{ color: status?.isRunning ? '#16a34a' : '#666' }}>
              {status?.isRunning ? '🟢 运行中' : '⚪ 空闲'}
            </span>
          </div>
        </div>

        {status && (
          <div className="grid">
            <div className="stat-card">
              <div className="value">{status.totalRuns || 0}</div>
              <div className="label">总运行次数</div>
            </div>
            <div className="stat-card">
              <div className="value">{status.consolidatedMemories || 0}</div>
              <div className="label">已整合记忆</div>
            </div>
            <div className="stat-card">
              <div className="value">{status.reorganizedClusters || 0}</div>
              <div className="label">已重组簇</div>
            </div>
            <div className="stat-card">
              <div className="value">{status.archivedMemories || 0}</div>
              <div className="label">已归档记忆</div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>💭 梦境功能</h2>
        <div className="grid">
          <div className="stat-card">
            <div className="value">🔗</div>
            <div className="label"><strong>记忆整合</strong></div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              将相似记忆合并，减少冗余
            </p>
          </div>
          <div className="stat-card">
            <div className="value">🔄</div>
            <div className="label"><strong>知识重组</strong></div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              重新组织知识图谱结构
            </p>
          </div>
          <div className="stat-card">
            <div className="value">📦</div>
            <div className="label"><strong>记忆归档</strong></div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              将不常用记忆移至长期存储
            </p>
          </div>
          <div className="stat-card">
            <div className="value">🧹</div>
            <div className="label"><strong>存储优化</strong></div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              清理和优化存储空间
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>📜 运行历史</h2>
        {history.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            暂无梦境运行记录
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>状态</th>
                <th>整合记忆</th>
                <th>重组簇</th>
                <th>归档记忆</th>
                <th>时长</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run, index) => (
                <tr key={index}>
                  <td>{formatDate(run.startTime)}</td>
                  <td>
                    <span className={`badge ${run.status === 'completed' ? 'badge-low' : 'badge-high'}`}>
                      {run.status === 'completed' ? '完成' : '失败'}
                    </span>
                  </td>
                  <td>{run.consolidatedMemories || 0}</td>
                  <td>{run.reorganizedClusters || 0}</td>
                  <td>{run.archivedMemories || 0}</td>
                  <td>{run.duration ? `${(run.duration / 1000).toFixed(1)}s` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Dreaming
