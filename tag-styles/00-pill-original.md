# 藥丸圓角 + 吊牌圓孔（原版）

白色文字、深色飽和底色、藥丸圓角、左側小白色圓孔裝飾、← 可勾選

---

## TAG_COLORS (gallery-loader.js)

```js
const TAG_COLORS = {
  '奶蛋素': {
    bg: '#6aab88',
    text: '#ffffff',
    shadow: 'rgba(106, 171, 136, 0.4)'
  },      // 柔和綠色（加深）
  '無咖啡因': {
    bg: '#7aadc5',
    text: '#ffffff',
    shadow: 'rgba(122, 173, 197, 0.4)'
  },    // 柔和藍色（加深）
  '含酒精': {
    bg: '#d4876a',
    text: '#ffffff',
    shadow: 'rgba(212, 135, 106, 0.4)'
  },      // 柔和橙粉色（加深）
  '可宅配': {
    bg: '#d4b35e',
    text: '#ffffff',
    shadow: 'rgba(212, 179, 94, 0.4)'
  },      // 柔和蜂蜜金（加深）
};
```

## CSS — 共用標籤 (.tag-badge)

```css
.tag-badge {
    display: inline-block;
    padding: 6px 14px 6px 22px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'Playfair Display', serif;
    line-height: 1.3;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.3);
    transition: all 0.3s ease;
    letter-spacing: 0.3px;
    position: relative;
    border-radius: 20px;
}

/* 左側吊牌小圓孔 */
.tag-badge::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.15);
}
```

## CSS — 圖片標籤

```css
.gallery-image-tag {
    backdrop-filter: blur(8px);
}

.gallery-image-tag:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
}
```

## CSS — 圖例標籤

```css
.tag-legend-badge {
    padding: 8px 18px 8px 26px;
    font-size: 13px;
}

.tag-legend-checkbox:checked + .tag-legend-badge {
    border: 2px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
    transform: translateY(-2px) scale(1.05);
}

.tag-legend-checkbox-label:hover .tag-legend-badge {
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
}

.tag-legend-checkbox:checked + .tag-legend-badge::after {
    content: '✓';
    position: absolute;
    top: -6px;
    left: -6px;
    width: 18px;
    height: 18px;
    background-color: rgba(255, 255, 255, 0.95);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #3d2817;
    font-weight: 700;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    z-index: 10;
}
```

## CSS — Modal 標籤

```css
.image-modal__tag {
    font-size: 13px;
}
```

## CSS — 手機版（media query 內）

```css
.gallery-image-tag {
    font-size: 11px;
    padding: 5px 12px 5px 18px;
}

.tag-legend-badge {
    font-size: 12px;
    padding: 6px 14px 6px 22px;
}
```

## 其他注意事項

- 「可勾選」提示文字帶有 `← ` 箭頭
- 「可勾選」是獨立 span，不在 `.tag-legend-items` 內
