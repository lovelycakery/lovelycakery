#!/usr/bin/env python3
"""
將 logo.png 轉換為 Windows .ico 圖示文件
需要安裝: pip install Pillow
"""
from PIL import Image
import sys
import os

def create_icon(input_path, output_path):
    """將 PNG 轉換為 ICO，包含多種尺寸"""
    try:
        img = Image.open(input_path)
        
        # ICO 文件需要多種尺寸，Windows 常用尺寸
        sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
        
        # 儲存為 ICO（Pillow 會自動處理多尺寸）
        img.save(output_path, format='ICO', sizes=sizes)
        print(f"✅ 圖示已生成：{output_path}")
        return True
    except Exception as e:
        print(f"❌ 錯誤：{e}")
        print("提示：請先安裝 Pillow: pip install Pillow")
        return False

if __name__ == '__main__':
    # 從專案根目錄執行
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(repo_root, 'site', 'assets', 'images', 'logo', 'logo.png')
    icon_path = os.path.join(repo_root, 'admin', 'icon.ico')
    
    if not os.path.exists(logo_path):
        print(f"❌ 找不到 logo 文件：{logo_path}")
        sys.exit(1)
    
    if create_icon(logo_path, icon_path):
        print(f"✅ 圖示文件已生成：{icon_path}")
    else:
        sys.exit(1)

