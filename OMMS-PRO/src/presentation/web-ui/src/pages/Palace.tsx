function Palace() {
  return (
    <div>
      <div className="card">
        <h2>🏛️ 记忆宫殿</h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          记忆宫殿可视化界面 - 按层次结构浏览记忆
        </p>

        <div className="grid">
          <div className="stat-card">
            <div className="value">3</div>
            <div className="label">侧厅 (Wings)</div>
          </div>
          <div className="stat-card">
            <div className="value">12</div>
            <div className="label">大厅 (Halls)</div>
          </div>
          <div className="stat-card">
            <div className="value">48</div>
            <div className="label">房间 (Rooms)</div>
          </div>
          <div className="stat-card">
            <div className="value">192</div>
            <div className="label">壁柜 (Closets)</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>📐 宫殿结构</h2>
        <div style={{ padding: '2rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', borderLeft: '4px solid #667eea' }}>
              <strong>侧厅 Wing 1</strong> - 个人记忆
              <div style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
                <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px', marginBottom: '0.5rem' }}>
                  <strong>大厅 Hall 1.1</strong> - 偏好与习惯
                </div>
                <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px' }}>
                  <strong>大厅 Hall 1.2</strong> - 重要事件
                </div>
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', borderLeft: '4px solid #764ba2' }}>
              <strong>侧厅 Wing 2</strong> - 知识与学习
              <div style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
                <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px', marginBottom: '0.5rem' }}>
                  <strong>大厅 Hall 2.1</strong> - 技术知识
                </div>
                <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px' }}>
                  <strong>大厅 Hall 2.2</strong> - 学习笔记
                </div>
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', borderLeft: '4px solid #f093fb' }}>
              <strong>侧厅 Wing 3</strong> - 交互与关系
              <div style={{ marginLeft: '2rem', marginTop: '0.5rem' }}>
                <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px', marginBottom: '0.5rem' }}>
                  <strong>大厅 Hall 3.1</strong> - 对话历史
                </div>
                <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px' }}>
                  <strong>大厅 Hall 3.2</strong> - 人际关系
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>💡 功能说明</h2>
        <ul style={{ color: '#666', lineHeight: '1.8' }}>
          <li><strong>侧厅 (Wing)</strong> - 最高级别的分类，如个人记忆、知识学习等</li>
          <li><strong>大厅 (Hall)</strong> - 中级分类，如技术知识、重要事件等</li>
          <li><strong>房间 (Room)</strong> - 具体主题分类</li>
          <li><strong>壁柜 (Closet)</strong> - 最细粒度的记忆容器</li>
        </ul>
      </div>
    </div>
  )
}

export default Palace
