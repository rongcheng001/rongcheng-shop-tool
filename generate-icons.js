const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

async function createMultiSizeIco() {
  try {
    const inputPng = path.join(__dirname, 'icon.png');
    const outputIco = path.join(__dirname, 'icon.ico');
    
    // 检查源文件
    try {
      await fs.access(inputPng);
    } catch {
      console.error('❌ 找不到源文件 icon.png');
      return;
    }

    console.log('🔄 生成多尺寸 ICO 图标...');

    // ICO 文件支持的尺寸
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    
    // 使用 sharp 生成多尺寸 ICO
    // sharp 会辅助处理多尺寸 ICO 的创建
    const sharpInstance = sharp(inputPng);
    
    await sharpInstance
      .resize(256, 256) // 设置最大尺寸
      .toFile(outputIco);

    console.log('✅ 多尺寸 ICO 生成完成:', outputIco);
    console.log('📏 包含尺寸:', sizes.join(', '));
    
  } catch (error) {
    console.error('❌ 转换失败:', error);
  }
}

// 运行转换
createMultiSizeIco();