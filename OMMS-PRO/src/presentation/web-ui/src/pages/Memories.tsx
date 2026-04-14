import { useEffect, useState } from 'react'
import { memoryApi, type Memory } from '../api/client'

function Memories() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [captureContent, setCaptureContent] = useState('')
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await memoryApi.getAll({ limit: 50 })
      if (result.success) {
        setMemories(result.data.memories || [])
      } else {
        setError('获取记忆列表失败')
      }
    } catch (err) {
      setError('获取记忆列表时出错')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCapture = async () => {
    if (!captureContent.trim()) return

    try {
      setCapturing(true)
      const result = await memoryApi.capture(captureContent)
      if (result.success) {
        setCaptureContent('')
        await loadMemories()
      } else {
        setError('捕获记忆失败')
      }
    } catch (err) {
      setError('捕获记忆时出错')
      console.error(err)
    } finally {
      setCapturing(false)
    }
  }

  const handleDelete = async (uid: string) => {
    if (!confirm('确定要删除这条记忆吗？')) return

    try {
      await memoryApi.delete(uid)
      await loadMemories()
    } catch (err) {
      setError('删除记忆时出错')
      console.error(err)
    }
  }

  const getImportanceBadge = (score: number) => {
    if (score >= 7) return <span className="badge badge-high">高</span>
    if (score >= 4) return <span className="badge badge-medium">中</span>
    return <span className="badge badge-low">低</span>
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
        <h2>✨ 捕获新记忆</h2>
        {error && <div className="error">{error}</div>}
        <textarea
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '1rem',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '1rem',
            marginBottom: '1rem',
            resize: 'vertical',
          }}
          placeholder="输入要捕获的内容..."
          value={captureContent}
          onChange={(e) => setCaptureContent(e.target.value)}
          onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && handleCapture()}
        />
        <button
          className="button"
          onClick={handleCapture}
          disabled={capturing || !captureContent.trim()}
        >
          {capturing ? '捕获中...' : '捕获记忆'}
        </button>
      </div>

      <div className="card">
        <h2>📚 记忆列表 ({memories.length})</h2>
        {memories.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            暂无记忆，开始捕获一些记忆吧！
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>摘要</th>
                <th>重要性</th>
                <th>作用域</th>
                <th>版本</th>
                <th>创建时间</th>
                <th>访问次数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((memory) => (
                <tr key={memory.uid}>
                  <td><span className="badge badge-medium">{memory.type}</span></td>
                  <td style={{ maxWidth: '300px' }}>{memory.summary}</td>
                  <td>
                    {getImportanceBadge(memory.importanceScore)}
                    <span style={{ marginLeft: '0.5rem', color: '#666' }}>
                      {memory.importanceScore}
                    </span>
                  </td>
                  <td><span className="badge badge-low">{memory.scope}</span></td>
                  <td>v{memory.version}</td>
                  <td>{formatDate(memory.createdAt)}</td>
                  <td>{memory.accessCount}</td>
                  <td>
                    <button
                      style={{
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                      onClick={() => handleDelete(memory.uid)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Memories
