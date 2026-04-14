
import { OMMS } from './src/index';
import { createRESTAPIServer } from './src/api';

async function main() {
  console.log('🚀 启动 OMMS-PRO 系统...');
  
  try {
    // 1. 初始化 OMMS 系统
    console.log('📦 初始化 OMMS 核心系统...');
    const omms = new OMMS();
    await omms.initialize();
    console.log('✅ OMMS 核心系统初始化完成');

    // 2. 创建 API 服务器
    console.log('🌐 启动 REST API 服务器...');
    const server = createRESTAPIServer({
      deps: {
        memoryService: omms.memoryService,
        // @ts-ignore dreamingManager 暂时为 null，项目代码中注释了待重构
        dreamingManager: null,
        profileManager: omms.profileManager,
      },
    });

    // 3. 启动服务器
    await server.start(3000, '0.0.0.0');
    
    console.log('\n🎉 OMMS-PRO 系统启动成功！');
    console.log('📍 API 服务器: http://localhost:3000');
    console.log('💡 按 Ctrl+C 停止服务器\n');

  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

main();
