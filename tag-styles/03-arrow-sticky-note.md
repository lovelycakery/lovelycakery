# 箭頭便利貼風格 (Arrow Sticky Note)

粉彩底色 + 深色文字、右側箭頭造型（clip-path）、微傾斜、hover 往右滑

---

## TAG_COLORS (gallery-loader.js)

```js
const TAG_COLORS = {
  '奶蛋素': {
    bg: '#c8e6c0',
    text: '#3a6b35',
    shadow: '1px 2px 4px rgba(0, 0, 0, 0.12)'
  },      // 粉綠便利貼
  '無咖啡因': {
    bg: '#b8d8e8',
    text: '#2c6080',
    shadow: '1px 2px 4px rgba(0, 0, 0, 0.12)'
  },    // 粉藍便利貼
  '含酒精': {
    bg: '#f5c6b0',
    text: '#8b4533',
    shadow: '1px 2px 4px rgba(0, 0, 0, 0.12)'
  },      // 粉橘便利貼
  '可宅配': {
    bg: '#f5e6a3',
    text: '#7a6520',
    shadow: '1px 2px 4px rgba(0, 0, 0, 0.12)'
  },      // 粉黃便利貼
};
```

## CSS — 共用標籤 (.tag-badge)

```css
.tag-badge {
    display: inline-block;
    padding: 5px 12px 5px 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: 'Playfair Display', serif;
    line-height: 1.3;
    white-space: nowrap;
    border: none;
    transition: all 0.3s ease;
    letter-spacing: 0.3px;
    position: relative;
    border-radius: 2px 0 0 2px;
    clip-path: polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%);
}
```

## CSS — 圖片標籤

```css
.gallery-image-tag {
    transform: rotate(-1deg);
}

.gallery-image-tag:nth-child(even) {
    transform: rotate(0.5deg);
}

.gallery-image-tag:hover {
    transform: rotate(0deg) translateX(2px);
}
```

## CSS — 圖例標籤

```css
.tag-legend-badge {
    padding: 7px 16px 7px 14px;
    font-size: 13px;
}

.tag-legend-checkbox:checked + .tag-legend-badge {
    filter: brightness(0.88);
    transform: translateX(3px);
}

.tag-legend-checkbox-label:hover .tag-legend-badge {
    transform: translateX(2px);
}

.tag-legend-checkbox:checked + .tag-legend-badge::before {
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
    font-size: 0;
    padding: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    letter-spacing: 0;
    transform: none;
    box-shadow: none;
    clip-path: none;
}

.tag-legend-badge {
    font-size: 12px;
    padding: 6px 12px;
}
```
