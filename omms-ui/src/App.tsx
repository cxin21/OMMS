import { useState, useEffect, useCallback } from 'react';
import { Brain, Database, Activity, Search, Settings, RefreshCw, Trash2, ArrowUp, TrendingUp, Users, Clock, BarChart3, Info, Download, ChevronDown, ChevronUp, Edit3, Check, X } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Memory, MemoryStats, LogEntry, OMMSConfig } from './types';

const API_BASE = '/api';

const TYPE_COLORS: Record<string, string> = {
  fact: '#3B82F6',
  preference: '#F59E0B',
  decision: '#10B981',
  error: '#EF4444',
  learning: '#8B5CF6',
  relationship: '#06B6D4',
};

const TYPE_LABELS: Record<string, string> = {
  fact: '事实',
  preference: '偏好',
  decision: '决策',
  error: '错误',
  learning: '学习',
  relationship: '关系',
};

const SCOPE_COLORS: Record<string, string> = {
  session: '#3B82F6',
  agent: '#10B981',
  global: '#F59E0B',
};

const SCOPE_LABELS: Record<string, string> = {
  session: '会话',
  agent: 'Agent',
  global: '全局',
};

const SCOPE_ORDER = ['session', 'agent', 'global'];

const BLOCK_LABELS: Record<string, string> = {
  working: '工作',
  session: '会话',
  core: '核心',
  archived: '归档',
};

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'memories' | 'logs' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<OMMSConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterScope, setFilterScope] = useState<string>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [selectedMemories, setSelectedMemories] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const [statsRes, memoriesRes, logsRes, configRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/memories`),
        fetch(`${API_BASE}/logs`),
        fetch(`${API_BASE}/config`),
      ]);

      const [statsJson, memoriesJson, logsJson, configJson] = await Promise.all([
        statsRes.json() as Promise<ApiResponse<{ stats: MemoryStats }>>,
        memoriesRes.json() as Promise<ApiResponse<{ memories: Memory[] }>>,
        logsRes.json() as Promise<ApiResponse<{ logs: LogEntry[] }>>,
        configRes.json() as Promise<ApiResponse<{ config: OMMSConfig }>>,
      ]);

      if (statsJson.success && statsJson.data) {
        setStats(statsJson.data.stats);
        setConnected(true);
      } else {
        setConnected(false);
      }

      if (memoriesJson.success && memoriesJson.data) {
        setMemories(memoriesJson.data.memories || []);
      }

      if (logsJson.success && logsJson.data) {
        setLogs(logsJson.data.logs || []);
      }

      if (configJson.success && configJson.data) {
        setConfig(configJson.data.config);
      }

      setLoading(false);
    } catch (e) {
      console.error('Failed to connect:', e);
      setConnected(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条记忆？')) return;
    await fetch(`${API_BASE}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchData();
  };

  const handlePromote = async (id: string, targetScope?: string) => {
    await fetch(`${API_BASE}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, targetScope }),
    });
    fetchData();
  };

  const handleBatchPromote = async (targetScope: string) => {
    if (selectedMemories.size === 0) return;
    
    await Promise.all(
      Array.from(selectedMemories).map(id =>
        fetch(`${API_BASE}/promote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, targetScope }),
        })
      )
    );
    
    setSelectedMemories(new Set());
    fetchData();
  };

  const handleBatchDelete = async () => {
    if (selectedMemories.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedMemories.size} 条记忆？`)) return;
    
    await Promise.all(
      Array.from(selectedMemories).map(id =>
        fetch(`${API_BASE}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      )
    );
    
    setSelectedMemories(new Set());
    fetchData();
  };

  const handleSaveConfig = async (newConfig: OMMSConfig) => {
    await fetch(`${API_BASE}/saveConfig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    fetchData();
  };

  const filteredMemories = memories.filter((m) => {
    const matchSearch = !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || m.type === filterType;
    const matchScope = filterScope === 'all' || m.scope === filterScope;
    const matchBlock = filterBlock === 'all' || m.block === filterBlock;
    return matchSearch && matchType && matchScope && matchBlock;
  });

  const typeData = stats ? Object.entries(stats.byType).map(([name, value]) => ({
    name: TYPE_LABELS[name] || name,
    value,
    fill: TYPE_COLORS[name] || '#gray',
  })).filter(d => d.value > 0) : [];

  const scopeData = stats ? [
    { name: SCOPE_LABELS.session, value: stats.session, fill: SCOPE_COLORS.session },
    { name: SCOPE_LABELS.agent, value: stats.agent, fill: SCOPE_COLORS.agent },
    { name: SCOPE_LABELS.global, value: stats.global, fill: SCOPE_COLORS.global },
  ].filter(d => d.value > 0) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin mx-auto text-blue-500" />
          <p className="mt-4 text-gray-600 text-lg">正在连接 OMMS...</p>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <Info className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-red-600 mb-4 text-lg font-medium">无法连接到 OMMS 服务</p>
          <p className="text-gray-500 mb-6">请确保 OpenClaw 已启动且 OMMS 插件已安装</p>
          <button onClick={() => fetchData(true)} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
            重试连接
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OMMS Dashboard</h1>
              <p className="text-sm text-green-600 font-medium">● 已连接 · 智能记忆管理系统 v2.9.0</p>
            </div>
          </div>
          <button onClick={() => fetchData(true)} className={`p-3 hover:bg-gray-100 rounded-xl transition-all ${refreshing ? 'animate-spin' : ''}`} title="刷新数据">
            <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: '概览', icon: Database },
              { id: 'memories', label: '记忆列表', icon: Brain },
              { id: 'logs', label: '活动日志', icon: Activity },
              { id: 'settings', label: '设置', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="总记忆数" value={stats.total} icon={Brain} color="blue" />
              <StatCard label="会话级" value={stats.session} icon={Clock} color="blue" />
              <StatCard label="Agent级" value={stats.agent} icon={Users} color="green" />
              <StatCard label="全局级" value={stats.global} icon={TrendingUp} color="yellow" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-blue-500" />
                  按类型分布
                </h3>
                {typeData.length > 0 ? (
                  <>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={typeData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={3} dataKey="value">
                            {typeData.map((entry, index) => (
                              <Cell key={index} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-4 justify-center">
                      {typeData.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-lg shadow-sm" style={{ backgroundColor: item.fill }} />
                          <span className="text-sm text-gray-700 font-medium">{item.name}: {item.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-green-500" />
                  按作用域分布
                </h3>
                {scopeData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scopeData}>
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                          {scopeData.map((entry, index) => (
                            <Cell key={index} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-500" />
                双评分统计
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
                  <div className="text-3xl font-bold text-blue-600">{stats.avgImportance?.toFixed(2) || '0.00'}</div>
                  <div className="text-sm text-blue-700 mt-1">平均重要性评分</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4">
                  <div className="text-3xl font-bold text-green-600">{stats.avgScopeScore?.toFixed(2) || '0.00'}</div>
                  <div className="text-sm text-green-700 mt-1">平均作用域评分</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
                  <div className="text-3xl font-bold text-purple-600">{stats.newestMemory ? new Date(stats.newestMemory).toLocaleDateString() : '-'}</div>
                  <div className="text-sm text-purple-700 mt-1">最新记忆</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                最近活动
              </h3>
              {logs.length > 0 ? (
                <div className="space-y-3">
                  {logs.slice(0, 8).map((log, i) => (
                    <div key={i} className="flex flex-col items-start gap-2 text-sm p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex items-center gap-3 w-full">
                        <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                          log.level === 'error' ? 'bg-red-100 text-red-700' :
                          log.level === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                          log.level === 'debug' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                        }`}>{log.level.toUpperCase()}</span>
                        <span className="text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="text-gray-900 flex-1">{log.message}</span>
                      </div>
                      {log.method && (
                        <div className="ml-12 text-gray-500 text-xs">
                          <span className="font-semibold">Method:</span> {log.method}
                        </div>
                      )}
                      {(log.agentId || log.sessionId || log.memoryId) && (
                        <div className="ml-12 text-gray-500 text-xs">
                          {log.agentId && <span className="mr-2"><span className="font-semibold">Agent:</span> {log.agentId}</span>}
                          {log.sessionId && <span className="mr-2"><span className="font-semibold">Session:</span> {log.sessionId}</span>}
                          {log.memoryId && <span className="mr-2"><span className="font-semibold">Memory:</span> {log.memoryId}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">暂无活动记录</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'memories' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="搜索记忆内容..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="all">所有类型</option>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)} className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="all">所有作用域</option>
                  {Object.entries(SCOPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select value={filterBlock} onChange={(e) => setFilterBlock(e.target.value)} className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="all">所有存储块</option>
                  {Object.entries(BLOCK_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedMemories.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-blue-900 font-medium">已选择 {selectedMemories.size} 条记忆</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBatchPromote('agent')}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                    >
                      批量提升到 Agent 级
                    </button>
                    <button
                      onClick={() => handleBatchPromote('global')}
                      className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium"
                    >
                      批量提升到全局级
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      批量删除
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMemories(new Set())}
                  className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-blue-600" />
                </button>
              </div>
            )}

            <div className="space-y-4">
              {filteredMemories.length > 0 ? filteredMemories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onDelete={handleDelete}
                  onPromote={handlePromote}
                  selected={selectedMemories.has(memory.id)}
                  onSelect={selected => {
                    const newSelected = new Set(selectedMemories);
                    if (selected) {
                      newSelected.add(memory.id);
                    } else {
                      newSelected.delete(memory.id);
                    }
                    setSelectedMemories(newSelected);
                  }}
                />
              )) : (
                <div className="text-center py-16 bg-white rounded-2xl shadow-lg">
                  <Brain className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">暂无记忆</p>
                  <p className="text-sm text-gray-400 mt-2">开始与 Agent 对话，记忆会自动产生</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <LogsPage logs={logs} />
        )}

        {activeTab === 'settings' && config && (
          <SettingsPage config={config} onSave={handleSaveConfig} />
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    yellow: 'from-yellow-500 to-yellow-600',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <Icon className="w-7 h-7 text-white" />
        </div>
        <div>
          <div className="text-3xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-500 mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

function MemoryCard({ memory, onDelete, onPromote, selected, onSelect }: { 
  memory: Memory; 
  onDelete: (id: string) => void; 
  onPromote: (id: string, targetScope?: string) => void;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}) {
  const [showPromoteMenu, setShowPromoteMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);

  const currentScopeIndex = SCOPE_ORDER.indexOf(memory.scope);
  const availableScopes = SCOPE_ORDER.slice(currentScopeIndex + 1);

  const handleSaveEdit = async () => {
    setEditing(false);
  };

  return (
    <div className={`bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="px-3 py-1 rounded-lg text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: TYPE_COLORS[memory.type] }}>
              {TYPE_LABELS[memory.type]}
            </span>
            <span className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: `${SCOPE_COLORS[memory.scope]}20`, color: SCOPE_COLORS[memory.scope] }}>
              {SCOPE_LABELS[memory.scope]}
            </span>
            <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
              {BLOCK_LABELS[memory.block]}
            </span>
          </div>

          {editing ? (
            <div className="mb-4">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
                rows={4}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  保存
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditContent(memory.content);
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  取消
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-900 text-base mb-4 leading-relaxed">{memory.content}</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3">
              <div className="text-2xl font-bold text-blue-600">{(memory.importance * 100).toFixed(0)}%</div>
              <div className="text-xs text-blue-700 mt-1">重要性</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3">
              <div className="text-2xl font-bold text-green-600">{(memory.scopeScore * 100).toFixed(0)}%</div>
              <div className="text-xs text-green-700 mt-1">作用域评分</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3">
              <div className="text-2xl font-bold text-purple-600">{memory.recallCount}</div>
              <div className="text-xs text-purple-700 mt-1">召回次数</div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-3">
              <div className="text-2xl font-bold text-orange-600">{memory.updateCount}</div>
              <div className="text-xs text-orange-700 mt-1">更新次数</div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">所有者：</span>
                <span className="font-semibold text-gray-900 ml-1">{memory.ownerAgentId || '未知'}</span>
              </div>
              {memory.agentId && (
                <div>
                  <span className="text-gray-500">当前Agent：</span>
                  <span className="font-semibold text-gray-900 ml-1">{memory.agentId}</span>
                </div>
              )}
              {memory.sessionId && (
                <div>
                  <span className="text-gray-500">会话ID：</span>
                  <span className="font-semibold text-gray-900 ml-1">{memory.sessionId}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">创建时间：</span>
                <span className="font-semibold text-gray-900 ml-1">{new Date(memory.createdAt).toLocaleString()}</span>
              </div>
              {memory.accessedAt && (
                <div>
                  <span className="text-gray-500">最后访问：</span>
                  <span className="font-semibold text-gray-900 ml-1">{new Date(memory.accessedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {memory.usedByAgents && memory.usedByAgents.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">使用过的Agent：</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {memory.usedByAgents.map((agent, i) => (
                    <span key={i} className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
                      {agent}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {memory.recallByAgents && Object.keys(memory.recallByAgents).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">召回统计：</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(memory.recallByAgents).map(([agent, count]) => (
                    <span key={agent} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                      {agent}: {count}次
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>创建: {new Date(memory.createdAt).toLocaleString()}</span>
            {memory.tags && memory.tags.length > 0 && (
              <div className="flex gap-2">
                {memory.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">#{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="p-3 hover:bg-blue-50 rounded-xl transition-colors group"
            title={editing ? "取消编辑" : "编辑记忆"}
          >
            <Edit3 className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
          </button>

          {availableScopes.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPromoteMenu(!showPromoteMenu)}
                className="p-3 hover:bg-green-50 rounded-xl transition-colors group"
                title="提升级别"
              >
                <ArrowUp className="w-5 h-5 text-green-600 group-hover:scale-110 transition-transform" />
              </button>

              {showPromoteMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[150px] z-10">
                  {availableScopes.map((scope) => (
                    <button
                      key={scope}
                      onClick={() => {
                        onPromote(memory.id, scope);
                        setShowPromoteMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                    >
                      提升到 {SCOPE_LABELS[scope]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={() => onDelete(memory.id)} className="p-3 hover:bg-red-50 rounded-xl transition-colors group" title="删除记忆">
            <Trash2 className="w-5 h-5 text-red-600 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsPage({ logs }: { logs: LogEntry[] }) {
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  const filteredLogs = logs.filter((log) => {
    const matchLevel = filterLevel === 'all' || log.level === filterLevel;
    const matchMethod = !filterMethod || log.method === filterMethod;
    const matchSearch = !searchQuery || 
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.method && log.method.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchLevel && matchMethod && matchSearch;
  });

  const uniqueMethods = Array.from(new Set(logs.map(l => l.method).filter(Boolean)));

  const handleExportLogs = () => {
    const data = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omms-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelCounts = {
    total: logs.length,
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    debug: logs.filter(l => l.level === 'debug').length,
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">日志统计</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-xl">
            <div className="text-3xl font-bold text-gray-900">{levelCounts.total}</div>
            <div className="text-sm text-gray-500 mt-1">总日志</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="text-3xl font-bold text-blue-600">{levelCounts.info}</div>
            <div className="text-sm text-gray-500 mt-1">Info</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-xl">
            <div className="text-3xl font-bold text-yellow-600">{levelCounts.warn}</div>
            <div className="text-sm text-gray-500 mt-1">Warning</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-xl">
            <div className="text-3xl font-bold text-red-600">{levelCounts.error}</div>
            <div className="text-sm text-gray-500 mt-1">Error</div>
          </div>
          <div className="text-center p-4 bg-gray-100 rounded-xl">
            <div className="text-3xl font-bold text-gray-600">{levelCounts.debug}</div>
            <div className="text-sm text-gray-500 mt-1">Debug</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索日志..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
            <option value="all">所有级别</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
            <option value="">所有方法</option>
            {uniqueMethods.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
          <button
            onClick={handleExportLogs}
            className="px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors flex items-center gap-2 font-medium"
          >
            <Download className="w-5 h-5" />
            导出日志
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">完整日志 ({filteredLogs.length} 条)</h3>
          <div className="text-sm text-gray-500">
            显示 {filteredLogs.length} 条日志
          </div>
        </div>
        {filteredLogs.length > 0 ? (
          <div className="space-y-2 font-mono text-sm max-h-[600px] overflow-y-auto">
            {filteredLogs.map((log, i) => {
              const isExpanded = expandedLogs.has(i);
              return (
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    onClick={() => {
                      const newExpanded = new Set(expandedLogs);
                      if (isExpanded) {
                        newExpanded.delete(i);
                      } else {
                        newExpanded.add(i);
                      }
                      setExpandedLogs(newExpanded);
                    }}
                    className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <span className="text-gray-400 shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold ${
                      log.level === 'error' ? 'bg-red-100 text-red-700' :
                      log.level === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                      log.level === 'debug' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                    }`}>{log.level.toUpperCase()}</span>
                    <span className="text-gray-900 flex-1">{log.message}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </div>
                  
                  {isExpanded && (
                    <div className="px-3 pb-3 bg-gray-50 border-t border-gray-200">
                      {log.method && (
                        <div className="text-gray-500 text-xs mb-2">
                          <span className="font-semibold">Method:</span> {log.method}
                        </div>
                      )}
                      {((typeof log.params !== 'undefined' && log.params !== null) || (typeof log.returns !== 'undefined' && log.returns !== null)) && (
                        <div className="text-gray-500 text-xs space-y-1 mb-2">
                          {typeof log.params !== 'undefined' && log.params !== null && (
                            <div>
                              <span className="font-semibold">Params:</span> {JSON.stringify(log.params)}
                            </div>
                          )}
                          {typeof log.returns !== 'undefined' && log.returns !== null && (
                            <div>
                              <span className="font-semibold">Returns:</span> {JSON.stringify(log.returns as any)}
                            </div>
                          )}
                        </div>
                      )}
                      {(log.agentId || log.sessionId || log.memoryId) && (
                        <div className="text-gray-500 text-xs mb-2">
                          {log.agentId && <span className="mr-2"><span className="font-semibold">Agent:</span> {log.agentId}</span>}
                          {log.sessionId && <span className="mr-2"><span className="font-semibold">Session:</span> {log.sessionId}</span>}
                          {log.memoryId && <span className="mr-2"><span className="font-semibold">Memory:</span> {log.memoryId}</span>}
                        </div>
                      )}
                      {log.error && (
                        <div className="text-red-500 text-xs mb-2">
                          <span className="font-semibold">Error:</span> {log.error}
                        </div>
                      )}
                      {log.data && (
                        <div className="text-gray-500 text-xs">
                          <span className="font-semibold">Data:</span> {JSON.stringify(log.data)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-12">暂无日志</div>
        )}
      </div>
    </div>
  );
}

function SettingsPage({ config, onSave }: { config: OMMSConfig; onSave: (config: OMMSConfig) => void }) {
  const [editedConfig, setEditedConfig] = useState(config);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(editedConfig);
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">功能开关</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigToggle
            label="自动记忆捕获"
            description="对话结束时自动提取关键内容"
            checked={editedConfig.enableAutoCapture}
            onChange={(v) => setEditedConfig({ ...editedConfig, enableAutoCapture: v })}
          />
          <ConfigToggle
            label="自动记忆召回"
            description="对话前自动注入相关记忆"
            checked={editedConfig.enableAutoRecall}
            onChange={(v) => setEditedConfig({ ...editedConfig, enableAutoRecall: v })}
          />
          <ConfigToggle
            label="LLM 智能提取"
            description="使用 LLM 进行内容提取"
            checked={editedConfig.enableLLMExtraction}
            onChange={(v) => setEditedConfig({ ...editedConfig, enableLLMExtraction: v })}
          />
          <ConfigToggle
            label="向量搜索"
            description="启用语义向量搜索"
            checked={editedConfig.enableVectorSearch}
            onChange={(v) => setEditedConfig({ ...editedConfig, enableVectorSearch: v })}
          />
          <ConfigToggle
            label="用户 Profile"
            description="构建和维护用户画像"
            checked={editedConfig.enableProfile}
            onChange={(v) => setEditedConfig({ ...editedConfig, enableProfile: v })}
          />
          <ConfigToggle
            label="知识图谱"
            description="启用关系追踪"
            checked={editedConfig.enableGraphEngine}
            onChange={(v) => setEditedConfig({ ...editedConfig, enableGraphEngine: v })}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">功能限制</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ConfigInput
            label="每会话最大记忆数"
            value={editedConfig.maxMemoriesPerSession}
            onChange={(v) => setEditedConfig({ ...editedConfig, maxMemoriesPerSession: Number(v) })}
            type="number"
          />
          <ConfigInput
            label="Web UI 端口"
            value={editedConfig.webUiPort}
            onChange={(v) => setEditedConfig({ ...editedConfig, webUiPort: Number(v) })}
            type="number"
          />
        </div>
      </div>

      {editedConfig.llm && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">LLM 配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ConfigInput
              label="Provider"
              value={editedConfig.llm.provider}
              onChange={(v) => setEditedConfig({ ...editedConfig, llm: { ...editedConfig.llm!, provider: v } })}
            />
            <ConfigInput
              label="Model"
              value={editedConfig.llm.model}
              onChange={(v) => setEditedConfig({ ...editedConfig, llm: { ...editedConfig.llm!, model: v } })}
            />
            <div className="md:col-span-2">
              <ConfigInput
                label="Base URL"
                value={editedConfig.llm.baseURL}
                onChange={(v) => setEditedConfig({ ...editedConfig, llm: { ...editedConfig.llm!, baseURL: v } })}
              />
            </div>
          </div>
        </div>
      )}

      {editedConfig.embedding && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Embedding 配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ConfigInput
              label="Model"
              value={editedConfig.embedding.model}
              onChange={(v) => setEditedConfig({ ...editedConfig, embedding: { ...editedConfig.embedding!, model: v } })}
            />
            <ConfigInput
              label="Dimensions"
              value={editedConfig.embedding.dimensions}
              onChange={(v) => setEditedConfig({ ...editedConfig, embedding: { ...editedConfig.embedding!, dimensions: Number(v) } })}
              type="number"
            />
            <div className="md:col-span-2">
              <ConfigInput
                label="Base URL"
                value={editedConfig.embedding.baseURL}
                onChange={(v) => setEditedConfig({ ...editedConfig, embedding: { ...editedConfig.embedding!, baseURL: v } })}
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
        <p className="text-yellow-800 text-sm">
          <strong>注意：</strong>修改配置后需要重启 OpenClaw 才能生效。部分配置可能需要环境变量支持。
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
      >
        {saving ? '保存中...' : '保存配置'}
      </button>
    </div>
  );
}

function ConfigToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
      <div>
        <div className="font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-1">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-14 h-8 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-300'}`}
      >
        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function ConfigInput({ label, value, onChange, type = 'text' }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
