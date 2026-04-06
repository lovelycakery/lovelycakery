# 便利貼風格 (Sticky Note)

粉彩底色 + 深色文字、方正微圓角、右下摺角、微傾斜、投影

---

## TAG_COLORS (gallery-loader.js)

```js
const TAG_COLORS = {
  '奶蛋素': {
    bg: '#c8e6c0',
    text: '#3a6b35',
    shadow: 'rgba(106, 171, 136, 0.3)'
  },      // 粉綠便利貼
  '無咖啡因': {
    bg: '#b8d8e8',
    text: '#2c6080',
    shadow: 'rgba(122, 173, 197, 0.3)'
  },    // 粉藍便利貼
  '含酒精': {
    bg: '#f5c6b0',
    text: '#8b4533',
    shadow: 'rgba(212, 135, 106, 0.3)'
  },      // 粉橘便利貼
  '可宅配': {
    bg: '#f5e6a3',
    text: '#7a6520',
    shadow: 'rgba(212, 179, 94, 0.3)'
  },      // 粉黃便利貼
};
```

## CSS — 共用標籤 (.tag-badge)

```css
.tag-badge {
    display: inline-block;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: 'Playfair Display', serif;
    line-height: 1.3;
    white-space: nowrap;
    border: none;
    transition: all 0.3s ease;
    letter-spacing: 0.3px;
    position: relative;
    border-radius: 2px;
    box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.15);
}

/* 便利貼右下角摺角 */
.tag-badge::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    width: 8px;
    height: 8px;
    background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.08) 50%);
    border-radius: 0 0 2px 0;
}
```

## CSS — 圖片標籤

```css
.gallery-image-tag {
    transform: rotate(-2deg);
}

.gallery-image-tag:nth-child(even) {
    transform: rotate(1.5deg);
}

.gallery-image-tag:hover {
    transform: rotate(0deg) translateY(-2px);
    box-shadow: 2px 4px 8px rgba(0, 0, 0, 0.2) !important;
}
```

## CSS — 圖例標籤

```css
.tag-legend-badge {
    padding: 7px 14px;
    font-size: 13px;
}

.tag-legend-checkbox:checked + .tag-legend-badge {
    box-shadow: 2px 3px 8px rgba(0, 0, 0, 0.25) !important;
    transform: translateY(-2px);
}

.tag-legend-checkbox-label:hover .tag-legend-badge {
    transform: translateY(-2px);
    box-shadow: 2px 3px 8px rgba(0, 0, 0, 0.2) !important;
}

.tag-legend-checkbox:checked + .tag-legend-badge::before {
    content: '✓';
    position: absolute;
    top: -6px;
    right: -6px;
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
    transform: rotate(-1deg);
}

.image-modal__tag:nth-child(even) {
    transform: rotate(1deg);
}
```

## CSS — 手機版（media query 內）

```css
.gallery-image-tag {
    font-size: 0;
    padding: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    letter-spacing: 0;
    transform: none;
    box-shadow: none;
}

.gallery-image-tag::after {
    display: none;
}

.tag-legend-badge {
    font-size: 12px;
    padding: 6px 12px;
}
```
