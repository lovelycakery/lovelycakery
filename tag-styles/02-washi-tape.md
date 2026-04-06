# 紙膠帶風格 (Washi Tape)

半透明、撕邊質感、微傾斜、方正無圓角

---

## TAG_COLORS (gallery-loader.js)

```js
const TAG_COLORS = {
  '奶蛋素': {
    bg: 'rgba(144, 200, 156, 0.7)',
    text: '#2e5e35',
    shadow: 'none'
  },      // 抹茶綠紙膠帶
  '無咖啡因': {
    bg: 'rgba(162, 200, 226, 0.7)',
    text: '#2a5575',
    shadow: 'none'
  },    // 天空藍紙膠帶
  '含酒精': {
    bg: 'rgba(235, 175, 155, 0.7)',
    text: '#7a3d2a',
    shadow: 'none'
  },      // 蜜桃粉紙膠帶
  '可宅配': {
    bg: 'rgba(240, 220, 150, 0.7)',
    text: '#6e5a18',
    shadow: 'none'
  },      // 奶油黃紙膠帶
};
```

## CSS — 共用標籤 (.tag-badge)

```css
.tag-badge {
    display: inline-block;
    padding: 4px 14px;
    font-size: 12px;
    font-weight: 600;
    font-family: 'Playfair Display', serif;
    line-height: 1.4;
    white-space: nowrap;
    border: none;
    transition: all 0.3s ease;
    letter-spacing: 0.5px;
    position: relative;
    border-radius: 0;
    box-shadow: none;
    -webkit-mask-image: url("data:image/svg+xml,...");
    mask-image: url("data:image/svg+xml,...");
    mask-size: 100% 100%;
}
```

## CSS — 圖片標籤

```css
.gallery-image-tag {
    transform: rotate(-1.5deg);
}
.gallery-image-tag:nth-child(even) {
    transform: rotate(1deg);
}
.gallery-image-tag:hover {
    transform: rotate(0deg) translateY(-1px);
    opacity: 0.9;
}
```

## CSS — 圖例標籤

```css
.tag-legend-badge {
    padding: 6px 18px;
    font-size: 13px;
}
.tag-legend-checkbox:checked + .tag-legend-badge {
    filter: brightness(0.92);
    transform: translateY(-1px);
    outline: 2px solid rgba(61, 40, 23, 0.25);
    outline-offset: 1px;
}
.tag-legend-checkbox-label:hover .tag-legend-badge {
    transform: translateY(-1px);
    filter: brightness(0.95);
}
.tag-legend-checkbox:checked + .tag-legend-badge::before {
    content: '✓';
    position: absolute;
    top: -7px;
    right: -7px;
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
    transform: rotate(-0.8deg);
}
.image-modal__tag:nth-child(even) {
    transform: rotate(0.6deg);
}
```

## CSS — 手機版

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
    -webkit-mask-image: none;
    mask-image: none;
}
.tag-legend-badge {
    font-size: 12px;
    padding: 6px 12px;
}
```
