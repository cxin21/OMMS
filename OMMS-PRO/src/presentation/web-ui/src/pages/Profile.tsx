import { useEffect, useState } from 'react'
import { profileApi, type Profile } from '../api/client'

function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const result = await profileApi.get()
      if (result.success) {
        setProfile(result.data)
      }
    } catch (err) {
      console.error('获取用户画像失败', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>👤 用户画像</h2>
          <button className="button" onClick={() => setEditing(!editing)}>
            {editing ? '取消编辑' : '编辑'}
          </button>
        </div>

        {profile && (
          <div>
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '1rem' }}>🎭 人格设定</h3>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>名称</label>
                  <div style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                    {profile.persona.name || '未设置'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>描述</label>
                  <div style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                    {profile.persona.description || '未设置'}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>特质标签</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {profile.persona.traits.length > 0 ? (
                    profile.persona.traits.map((trait, index) => (
                      <span key={index} className="badge badge-medium">{trait}</span>
                    ))
                  ) : (
                    <span style={{ color: '#999' }}>暂无特质</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '1rem' }}>⚙️ 偏好设置</h3>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>沟通风格</label>
                  <div style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                    {profile.preferences.communicationStyle || '未设置'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>响应格式</label>
                  <div style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                    {profile.preferences.format || '未设置'}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>感兴趣话题</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {profile.preferences.topics.length > 0 ? (
                    profile.preferences.topics.map((topic, index) => (
                      <span key={index} className="badge badge-low">{topic}</span>
                    ))
                  ) : (
                    <span style={{ color: '#999' }}>暂无话题</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ color: '#333', marginBottom: '1rem' }}>📊 交互历史</h3>
              {profile.interactionHistory.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>类型</th>
                        <th>详情</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.interactionHistory.slice(-10).reverse().map((item, index) => (
                        <tr key={index}>
                          <td>{new Date(item.timestamp).toLocaleString('zh-CN')}</td>
                          <td><span className="badge badge-medium">{item.type}</span></td>
                          <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {JSON.stringify(item.details)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>
                  暂无交互记录
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Profile
