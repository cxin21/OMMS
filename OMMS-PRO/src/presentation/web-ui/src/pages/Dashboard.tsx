import { useEffect, useState } from 'react'
import { systemApi, type SystemStats } from '../api/client'

function Dashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await systemApi.getStats()
      if (result.success) {
        setStats(result.data)
      } else {
        setError('获取统计数据失败')
      }
    } catch (err) {
      setError('获取统计数据时出错')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  if (error) {
    return (
      <div>
        <div className="error">{error}</div>
        <button className="button" onClick={loadStats}>重试</button>
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <h2>📊 系统概览</h2>
        <div className="grid">
          <div className="stat-card">
            <div className="value">{stats?.totalMemories || 0}</div>
            <div className="label">总记忆数</div>
          </div>
          <div className="stat-card">
            <div className="value">{(stats?.avgImportanceScore || 0).toFixed(1)}</div>
            <div className="label">平均重要性评分</div>
          </div>
          <div className="stat-card">
            <div className="value">{(stats?.avgScopeScore || 0).toFixed(1)}</div>
            <div className="label">平均作用域评分</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats?.dreamingRuns || 0}</div>
            <div className="label">梦境运行次数</div>
          </div>
        </div>
      </div>

      {stats && (
        <>
          <div className="card">
            <h2>📈 记忆类型分布</h2>
            <div className="grid">
              {Object.entries(stats.memoriesByType).map(([type, count]) => (
                <div key={type} className="stat-card">
                  <div className="value">{count}</div>
                  <div className="label">{type}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>🌐 作用域分布</h2>
            <div className="grid">
              {Object.entries(stats.memoriesByScope).map(([scope, count]) => (
                <div key={scope} className="stat-card">
                  <div className="value">{count}</div>
                  <div className="label">{scope}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h2>💡 快捷操作</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="button" onClick={() => window.location.href = '/memories'}>
            查看所有记忆
          </button>
          <button className="button" onClick={() => window.location.href = '/dreaming'}>
            启动梦境引擎
          </button>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
