// Gallery loader for seasonal.html and all-items.html
// Dynamically loads images from JSON data files
(function () {
  if (window.LovelyGalleryLoader) return;

  async function loadGalleryData(type) {
    // file:// 協議下 fetch 本地檔案會被瀏覽器阻擋，改用 GitHub raw URL
    const isLocalFile = window.location.protocol === 'file:';
    let dataFile = isLocalFile
      ? `https://raw.githubusercontent.com/lovelycakery/lovelycakery/main/site/assets/data/${type}-data.json`
      : `assets/data/${type}-data.json`;

    // Admin 預覽模式：加上時間戳避免瀏覽器快取舊 JSON
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('adminPreview') === '1') {
      dataFile += (dataFile.includes('?') ? '&' : '?') + 'ts=' + Date.now();
    }

    try {
      const response = await fetch(dataFile);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data && Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      console.warn(`Failed to load ${type} data:`, e);
      return [];
    }
  }

  function createImageModal(item) {
    const currentLang = localStorage.getItem('language') || 'zh';
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    
    // 根據語言獲取名稱和說明
    const itemNameZh = item.name || '未命名';
    const itemNameEn = item.name_en || item.name || 'Untitled';
    const itemName = currentLang === 'en' ? itemNameEn : itemNameZh;
    
    const itemDescriptionZh = item.description || '';
    const itemDescriptionEn = item.description_en || item.description || '';
    const itemDescription = currentLang === 'en' ? itemDescriptionEn : itemDescriptionZh;
    
    // 生成標籤 HTML，支持國際化
    let tagsHTML = '';
    if (item.tags && item.tags.length > 0) {
      const tags = item.tags.map(tag => {
        const tagText = getTagText(tag, currentLang);
        const tagTextZh = TAG_I18N[tag] ? TAG_I18N[tag].zh : tag;
        const tagTextEn = TAG_I18N[tag] ? TAG_I18N[tag].en : tag;
        return `<span class="image-modal__tag" data-en="${tagTextEn}" data-zh="${tagTextZh}" data-tag-key="${tag}">${tagText}</span>`;
      }).join('');
      tagsHTML = `<div class="image-modal__tags">${tags}</div>`;
    }
    
    // 處理價格顯示
    let priceHTML = '';
    if (item.prices && typeof item.prices === 'object') {
      const prices = item.prices;
      const size6 = prices.size6 || '';
      const size8 = prices.size8 || '';
      const slice = prices.slice || '';
      
      // 如果有任何價格，顯示價格選單
      if (size6 || size8 || slice) {
        const sizeOptions = [];
        if (size6) {
          const size6TextZh = getSizeText('size6', 'zh');
          const size6TextEn = getSizeText('size6', 'en');
          sizeOptions.push(`<option value="size6" data-price="${size6}" data-en="${size6TextEn}" data-zh="${size6TextZh}">${getSizeText('size6', currentLang)}</option>`);
        }
        if (size8) {
          const size8TextZh = getSizeText('size8', 'zh');
          const size8TextEn = getSizeText('size8', 'en');
          sizeOptions.push(`<option value="size8" data-price="${size8}" data-en="${size8TextEn}" data-zh="${size8TextZh}">${getSizeText('size8', currentLang)}</option>`);
        }
        if (slice) {
          const sliceTextZh = getSizeText('slice', 'zh');
          const sliceTextEn = getSizeText('slice', 'en');
          sizeOptions.push(`<option value="slice" data-price="${slice}" data-en="${sliceTextEn}" data-zh="${sliceTextZh}">${getSizeText('slice', currentLang)}</option>`);
        }
        
        // 預設選擇第一個選項
        const defaultSize = size6 ? 'size6' : (size8 ? 'size8' : 'slice');
        const defaultPrice = prices[defaultSize] || '';
        
        priceHTML = `
          <div class="image-modal__price-section">
            <div class="image-modal__price-select-wrapper">
              <select class="image-modal__price-select" id="modalPriceSelect">
                ${sizeOptions.join('')}
              </select>
              <span class="image-modal__price-display">NT$ <span id="modalPriceValue">${defaultPrice}</span></span>
            </div>
          </div>
        `;
      }
    }
    
    modal.innerHTML = `
      <div class="image-modal__overlay"></div>
      <div class="image-modal__content">
        <button class="image-modal__close" aria-label="關閉">&times;</button>
        <div class="image-modal__image-wrapper">
          <img src="${item.image}" alt="${itemName}" class="image-modal__image">
        </div>
        <div class="image-modal__info">
          <h3 class="image-modal__name" data-en="${itemNameEn}" data-zh="${itemNameZh}">${itemName}</h3>
          ${priceHTML}
          ${itemDescription ? `<p class="image-modal__description" data-en="${itemDescriptionEn}" data-zh="${itemDescriptionZh}">${itemDescription}</p>` : ''}
          ${tagsHTML}
        </div>
      </div>
    `;
    
    // 綁定價格選單變更事件
    if (priceHTML && item.prices) {
      const priceSelect = modal.querySelector('#modalPriceSelect');
      const priceValue = modal.querySelector('#modalPriceValue');
      if (priceSelect && priceValue) {
        priceSelect.addEventListener('change', (e) => {
          const selectedOption = e.target.options[e.target.selectedIndex];
          const price = selectedOption.getAttribute('data-price');
          if (priceValue) {
            priceValue.textContent = price;
          }
        });
      }
    }
    
    const closeModal = () => {
      if (modal.parentNode) document.body.removeChild(modal);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', escHandler);
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') closeModal();
    };

    modal.querySelector('.image-modal__overlay').addEventListener('click', closeModal);
    modal.querySelector('.image-modal__close').addEventListener('click', closeModal);
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
  }

  // 標籤顏色定義（精緻可愛風格 - 單色）
  const TAG_COLORS = {
    '奶蛋素': { 
      bg: '#8fc4a3', 
      text: '#ffffff',
      shadow: 'rgba(143, 196, 163, 0.4)'
    },      // 柔和綠色
    '無咖啡因': { 
      bg: '#9bc4d9', 
      text: '#ffffff',
      shadow: 'rgba(155, 196, 217, 0.4)'
    },    // 柔和藍色
    '含酒精': { 
      bg: '#e8a689', 
      text: '#ffffff',
      shadow: 'rgba(232, 166, 137, 0.4)'
    },      // 柔和橙粉色
  };

  // 標籤中英文對應
  const TAG_I18N = {
    '奶蛋素': { zh: '奶蛋素', en: 'Vegetarian' },
    '無咖啡因': { zh: '無咖啡因', en: 'Caffeine-Free' },
    '含酒精': { zh: '含酒精', en: 'Alcohol' },
  };

  // 尺寸選項中英文對應
  const SIZE_I18N = {
    'size6': { zh: '6吋', en: '6"' },
    'size8': { zh: '8吋', en: '8"' },
    'slice': { zh: '切片', en: 'Slice' },
  };

  // 獲取標籤的本地化文本
  function getTagText(tag, lang) {
    const normalized = lang === 'en' ? 'en' : 'zh';
    return TAG_I18N[tag] ? TAG_I18N[tag][normalized] : tag;
  }

  // 獲取尺寸的本地化文本
  function getSizeText(sizeKey, lang) {
    const normalized = lang === 'en' ? 'en' : 'zh';
    return SIZE_I18N[sizeKey] ? SIZE_I18N[sizeKey][normalized] : sizeKey;
  }

  // 篩選圖片
  function filterGallery(selectedTags) {
    const items = document.querySelectorAll('.gallery-item');
    
    if (selectedTags.length === 0) {
      // 沒有選中任何標籤，顯示所有圖片
      items.forEach(item => {
        item.style.display = '';
      });
      return;
    }

    // 有選中標籤，只顯示包含任一選中標籤的圖片（OR 邏輯）
    items.forEach(item => {
      const itemTags = item.dataset.tags ? item.dataset.tags.split(',') : [];
      const hasSelectedTag = selectedTags.some(tag => itemTags.includes(tag));
      item.style.display = hasSelectedTag ? '' : 'none';
    });
  }

  // 渲染圖例（可勾選）
  function renderTagLegend(container) {
    // 檢查是否已經有圖例
    const existingLegend = document.querySelector('.tag-legend');
    if (existingLegend) {
      existingLegend.remove();
    }

    // 獲取當前語言
    const currentLang = localStorage.getItem('language') || 'zh';

    // 創建圖例容器
    const legend = document.createElement('div');
    legend.className = 'tag-legend';
    
    const legendItems = Object.keys(TAG_COLORS).map(tag => {
      const color = TAG_COLORS[tag];
      const tagText = getTagText(tag, currentLang);
      const tagTextZh = TAG_I18N[tag] ? TAG_I18N[tag].zh : tag;
      const tagTextEn = TAG_I18N[tag] ? TAG_I18N[tag].en : tag;
      return `
        <div class="tag-legend-item">
          <label class="tag-legend-checkbox-label">
            <input type="checkbox" class="tag-legend-checkbox" value="${tag}" data-tag="${tag}">
            <span class="tag-legend-badge" data-en="${tagTextEn}" data-zh="${tagTextZh}" style="background-color: ${color.bg}; color: ${color.text}; box-shadow: 0 2px 8px ${color.shadow}; --tag-bg-color: ${color.bg};">${tagText}</span>
          </label>
        </div>
      `;
    }).join('');

    legend.innerHTML = `
      <div class="tag-legend-items">${legendItems}</div>
      <button class="tag-legend-clear-btn" data-en="Clear All" data-zh="取消選取">取消選取</button>
    `;

    // 插入到 page-header 下方，gallery-grid 上方
    const pageHeader = document.querySelector('.page-header');
    if (pageHeader) {
      // 插入到 page-header 的下一個兄弟元素之前（通常是 gallery-grid）
      if (pageHeader.nextSibling) {
        pageHeader.parentNode.insertBefore(legend, pageHeader.nextSibling);
      } else {
        // 如果沒有下一個兄弟元素，直接插入到 page-header 後面
        pageHeader.parentNode.appendChild(legend);
      }
    } else {
      // 如果沒有 page-header，插入到 container 前面
      container.parentNode.insertBefore(legend, container);
    }

    // 綁定 checkbox 事件
    const checkboxes = legend.querySelectorAll('.tag-legend-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const selectedTags = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);
        filterGallery(selectedTags);
      });
    });

    // 綁定「取消選取」按鈕事件
    const clearBtn = legend.querySelector('.tag-legend-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        // 取消所有 checkbox 的選取
        checkboxes.forEach(checkbox => {
          checkbox.checked = false;
        });
        // 顯示所有圖片
        filterGallery([]);
      });
    }

    // 應用語言（如果 i18n 已載入）
    if (window.LovelyI18n) {
      const currentLang = localStorage.getItem('language') || 'zh';
      window.LovelyI18n.applyLanguage(currentLang, legend);
    }
  }

  // 渲染圖片標籤（右下角）
  function renderImageTags(imageWrapper, tags) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) return;

    // 過濾出有顏色定義的標籤
    const validTags = tags.filter(tag => TAG_COLORS[tag]);
    if (validTags.length === 0) return;

    // 獲取當前語言
    const currentLang = localStorage.getItem('language') || 'zh';

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'gallery-image-tags';

    validTags.forEach(tag => {
      const color = TAG_COLORS[tag];
      const tagText = getTagText(tag, currentLang);
      const tagTextZh = TAG_I18N[tag] ? TAG_I18N[tag].zh : tag;
      const tagTextEn = TAG_I18N[tag] ? TAG_I18N[tag].en : tag;
      const tagBadge = document.createElement('span');
      tagBadge.className = 'gallery-image-tag';
      tagBadge.textContent = tagText;
      tagBadge.setAttribute('data-en', tagTextEn);
      tagBadge.setAttribute('data-zh', tagTextZh);
      tagBadge.setAttribute('data-tag-key', tag); // 保存原始標籤鍵，用於語言切換
      tagBadge.style.backgroundColor = color.bg;
      tagBadge.style.color = color.text;
      tagBadge.style.boxShadow = `0 2px 8px ${color.shadow}`;
      // 設置箭頭尾巴的顏色（使用 CSS 變數）
      tagBadge.style.setProperty('--tag-bg-color', color.bg);
      // 使用 ::before 和 ::after 偽元素來創建箭頭
      tagsContainer.appendChild(tagBadge);
    });

    imageWrapper.appendChild(tagsContainer);
  }

  function renderGallery(items, container) {
    container.innerHTML = '';
    
    // 獲取當前語言
    const currentLang = localStorage.getItem('language') || 'zh';
    
    // 檢測是否為 admin 模式，以及是編輯模式還是預覽模式
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.get('adminPreview') === '1';
    const adminMode = urlParams.get('mode'); // 'edit' 或 'preview'
    const isEditMode = isAdminMode && adminMode === 'edit'; // 只有在編輯模式下才啟用拖曳和點擊編輯
    
    // 渲染圖例（在頁面上方）
    renderTagLegend(container);
    
    items.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'gallery-item';
      
      // 處理圖片路徑：在 file:// 協議下，中文字符需要正確編碼
      // 但瀏覽器通常會自動處理，所以直接使用路徑即可
      const imageSrc = item._previewUrl || item.image;
      
      // 根據語言獲取名稱
      const imageNameZh = item.name || '手工千層蛋糕';
      const imageNameEn = item.name_en || item.name || 'Handmade Mille Crepe Cake';
      const imageName = currentLang === 'en' ? imageNameEn : imageNameZh;
      const imageAlt = imageName + (currentLang === 'en' ? ' - Lovely Cakery' : ' - Lovely Cakery 手工千層');
      
      // 將標籤儲存到 data 屬性中，用於篩選
      if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        // 只儲存有顏色定義的標籤
        const validTags = item.tags.filter(tag => TAG_COLORS[tag]);
        if (validTags.length > 0) {
          itemEl.dataset.tags = validTags.join(',');
        }
      }
      
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'gallery-image-wrapper';
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = imageAlt;
      img.className = 'gallery-image';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 1600;
      img.height = 1600;
      imageWrapper.appendChild(img);

      // 如果有標籤，在圖片上顯示標籤
      if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        renderImageTags(imageWrapper, item.tags);
      }

      const itemInfo = document.createElement('div');
      itemInfo.className = 'gallery-item-info';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'gallery-item-name';
      nameDiv.setAttribute('data-en', imageNameEn);
      nameDiv.setAttribute('data-zh', imageNameZh);
      nameDiv.textContent = imageName;
      itemInfo.appendChild(nameDiv);
      
      itemEl.appendChild(imageWrapper);
      itemEl.appendChild(itemInfo);
      
      // ============================================
      // ADMIN 編輯模式：拖曳排序 + 點擊編輯功能
      // ============================================
      // 重要：拖曳和點擊事件會衝突，需要正確處理：
      // 1. 拖曳時：設置 hasDragged 標記，避免觸發點擊
      // 2. 點擊時：檢查 hasDragged 和時間差，確保不是拖曳後的誤觸發
      // 3. 時間閾值：200ms，如果拖曳開始後 200ms 內點擊，視為拖曳操作
      // 注意：只有在編輯模式下才啟用拖曳和點擊編輯，預覽模式下點擊會顯示 modal
      // ============================================
      if (isEditMode) {
        itemEl.draggable = true;
        itemEl.dataset.index = index;
        itemEl.classList.add('admin-draggable');
        // 禁用 IMG 原生拖曳，確保拖曳事件由父元素 itemEl 觸發
        var imgEl = itemEl.querySelector('img');
        if (imgEl) imgEl.draggable = false;
        
        // 拖曳狀態追蹤：用於區分拖曳和點擊操作
        let dragStartTime = 0;  // 拖曳開始時間戳
        let hasDragged = false; // 是否實際發生了拖曳移動
        
        // 拖曳開始
        // 注意：必須重置 hasDragged，因為每次拖曳都是新的操作
        itemEl.addEventListener('dragstart', (e) => {
          dragStartTime = Date.now();
          hasDragged = false; // 重置：拖曳剛開始，還沒有移動
          e.stopPropagation(); // 防止 image-protection.js 攔截拖曳
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', (itemEl.dataset.index || index).toString());
          itemEl.classList.add('dragging');
          container.classList.add('dragging-active');
          
          // 設置拖曳圖像（自定義拖曳預覽，提升視覺效果）
          try {
            const dragImage = itemEl.cloneNode(true);
            dragImage.style.width = itemEl.offsetWidth + 'px';
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-9999px';
            dragImage.style.opacity = '0.8';
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, itemEl.offsetWidth / 2, itemEl.offsetHeight / 2);
            setTimeout(() => {
              if (document.body.contains(dragImage)) {
                document.body.removeChild(dragImage);
              }
            }, 0);
          } catch (err) {
            // 如果設置拖曳圖像失敗，使用默認行為
            console.warn('Failed to set custom drag image:', err);
          }
        });
        
        // 拖曳結束
        // 注意：hasDragged 標記需要延遲重置，避免 dragend 後立即觸發 click 事件
        itemEl.addEventListener('dragend', () => {
          itemEl.classList.remove('dragging');
          container.classList.remove('dragging-active');
          document.querySelectorAll('.gallery-item').forEach(el => {
            el.classList.remove('drag-over');
          });
          // 延遲重置標記（100ms），確保 click 事件能正確判斷是否為拖曳操作
          // 這是關鍵：如果立即重置，click 事件可能會誤觸發
          setTimeout(() => {
            hasDragged = false;
            dragStartTime = 0; // 同時重置時間戳
          }, 100);
        });
        
        // 拖曳經過（可放置位置）
        // 注意：當滑鼠移動到其他項目上時，標記 hasDragged = true
        // 這表示用戶確實進行了拖曳操作，而不只是點擊
        itemEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          
          // 只在還沒有標記為 drag-over 時添加，避免重複觸發和重複設置標記
          if (!itemEl.classList.contains('drag-over')) {
            itemEl.classList.add('drag-over');
            hasDragged = true; // 關鍵：標記已發生拖曳移動
          }
        });
        
        // 拖曳離開
        itemEl.addEventListener('dragleave', (e) => {
          // 檢查是否真的離開了元素（而不是進入子元素）
          const rect = itemEl.getBoundingClientRect();
          const x = e.clientX;
          const y = e.clientY;
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            itemEl.classList.remove('drag-over');
          }
        });
        
        // 放置（完成拖曳排序）
        // 注意：必須驗證索引有效性，避免錯誤的排序操作
        itemEl.addEventListener('drop', (e) => {
          e.preventDefault();
          itemEl.classList.remove('drag-over');
          hasDragged = true; // 確保標記為拖曳操作
          
          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
          const toIndex = parseInt(itemEl.dataset.index, 10) || index;
          
          // 驗證：確保索引有效且不同
          if (isNaN(fromIndex) || isNaN(toIndex)) {
            console.warn('Invalid drag indices:', { fromIndex, toIndex });
            return;
          }
          
          if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            // 通知父窗口進行排序
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'gallery-reorder',
                fromIndex: fromIndex,
                toIndex: toIndex,
              }, '*');
            } else {
              console.warn('Cannot send message: not in iframe context');
            }
          }
        });
        
        // ============================================
        // 點擊編輯功能（必須與拖曳區分開）
        // ============================================
        // 關鍵邏輯：區分拖曳和點擊
        // 1. 如果 hasDragged = true：表示發生了拖曳，不觸發點擊
        // 2. 如果拖曳開始後 200ms 內點擊：視為拖曳操作的一部分，不觸發點擊
        // 3. 否則：視為正常的點擊操作，發送 postMessage 給父窗口（編輯模式）
        // ============================================
        itemEl.addEventListener('click', (e) => {
          const now = Date.now();
          const timeSinceDragStart = dragStartTime > 0 ? now - dragStartTime : Infinity;
          
          // 檢查是否為拖曳操作：
          // - hasDragged = true：已發生拖曳移動
          // - timeSinceDragStart < 200ms：拖曳開始後短時間內點擊（可能是拖曳的一部分）
          if (hasDragged || timeSinceDragStart < 200) {
            e.preventDefault();
            e.stopPropagation();
            return; // 不觸發點擊編輯
          }
          
          // 驗證索引有效性
          if (typeof index !== 'number' || index < 0) {
            console.warn('Invalid image index for edit:', index);
            return;
          }
          
          // 在編輯模式下，阻止默認行為和事件冒泡，避免觸發 modal
          e.preventDefault();
          e.stopPropagation();
          
          // 通知父窗口打開編輯面板（僅在編輯模式）
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'gallery-edit',
              index: index,
            }, '*');
          } else {
            console.warn('Cannot send edit message: not in iframe context');
          }
        });
      } else {
        // 非編輯模式（包括預覽模式和訪客模式）：點擊顯示 modal
        itemEl.addEventListener('click', () => {
          createImageModal(item);
        });
      }
      
      container.appendChild(itemEl);
    });
    
    // 在 admin 編輯模式下注入拖曳樣式
    if (isEditMode && !document.getElementById('admin-drag-styles')) {
      const style = document.createElement('style');
      style.id = 'admin-drag-styles';
      style.textContent = `
        .admin-draggable {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }
        .admin-draggable:hover {
          cursor: grab;
        }
        .admin-draggable:active,
        .admin-draggable.dragging {
          cursor: grabbing;
        }
        .admin-draggable.dragging {
          opacity: 0.4;
          transform: scale(0.95);
          box-shadow: 0 8px 24px rgba(61, 40, 23, 0.3);
          z-index: 1000;
        }
        .admin-draggable.drag-over {
          position: relative;
        }
        .admin-draggable.drag-over::before {
          content: '';
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border: 3px solid rgba(212, 165, 116, 0.9);
          border-radius: 12px;
          background: rgba(212, 165, 116, 0.15);
          box-shadow: 0 0 0 4px rgba(212, 165, 116, 0.1), 0 4px 12px rgba(212, 165, 116, 0.3);
          z-index: -1;
          animation: dragPulse 1.5s ease-in-out infinite;
        }
        .admin-draggable.drag-over::after {
          content: '${(localStorage.getItem("language") === "en") ? "Drop here" : "放置這裡"}';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(212, 165, 116, 0.95);
          color: #1b120a;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          z-index: 1001;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        @keyframes dragPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.02);
          }
        }
        .gallery-grid {
          position: relative;
        }
        .gallery-grid.dragging-active .gallery-item:not(.dragging) {
          transition: transform 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }
  }

  async function initGallery(type) {
    const container = document.querySelector('.gallery-grid');
    if (!container) return;

    const items = await loadGalleryData(type);
    if (!items || items.length === 0) {
      const lang = localStorage.getItem('language') || 'zh';
      container.innerHTML = '<p style="text-align:center;padding:40px;color:#6b5d4f;font-size:16px;" data-en="Unable to load content. Please try again later." data-zh="無法載入內容，請稍後再試。">' +
        (lang === 'en' ? 'Unable to load content. Please try again later.' : '無法載入內容，請稍後再試。') + '</p>';
      return;
    }
    renderGallery(items, container);
  }

  // 注入選取狀態的 CSS 樣式（僅在 admin 模式下）
  const urlParams = new URLSearchParams(window.location.search);
  const isAdminMode = urlParams.get('adminPreview') === '1';
  if (isAdminMode && !document.getElementById('admin-selected-styles')) {
    const style = document.createElement('style');
    style.id = 'admin-selected-styles';
    style.textContent = `
      .gallery-item.selected {
        position: relative;
      }
      .gallery-item.selected .gallery-image {
        outline: 3px solid rgba(212, 165, 116, 0.9);
        outline-offset: 2px;
      }
      .gallery-item.selected::before {
        content: '${(localStorage.getItem("language") === "en") ? "Selected" : "已選取"}';
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(212, 165, 116, 0.95);
        color: #1b120a;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        z-index: 10;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
      .batch-mode .gallery-item {
        cursor: pointer;
        position: relative;
      }
      .batch-mode .gallery-item::after {
        content: '';
        position: absolute;
        top: 10px;
        left: 10px;
        width: 24px;
        height: 24px;
        border: 2px solid rgba(255,255,255,0.6);
        border-radius: 6px;
        background: rgba(0,0,0,0.3);
        z-index: 10;
        pointer-events: none;
      }
      .batch-mode .gallery-item.batch-selected::after {
        content: '✓';
        background: rgba(226, 106, 90, 0.95);
        border-color: rgba(226, 106, 90, 0.95);
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .batch-mode .gallery-item.batch-selected .gallery-image {
        outline: 3px solid rgba(226, 106, 90, 0.9);
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  // 點擊空白處取消選取（僅 admin 編輯模式）
  if (isAdminMode && urlParams.get('mode') === 'edit') {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.gallery-item')) {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'gallery-deselect' }, '*');
        }
      }
    });
  }

  // 監聽來自父窗口的消息（滾動、選取狀態、語言切換）
  let currentSelectedIndex = -1; // 追蹤當前選取的圖片索引
  
  window.addEventListener('message', (e) => {
    // 安全檢查：接受來自同源或本地開發服務器的訊息
    // 在 Electron 環境中，origin 可能是 http://127.0.0.1:PORT
    const isSameOrigin = e.origin === window.location.origin;
    const isLocalhost = e.origin.startsWith('http://127.0.0.1:') || e.origin.startsWith('http://localhost:');
    if (!isSameOrigin && !isLocalhost) {
      return;
    }
    
    // 處理語言切換消息
    // 所有可翻譯元素（標籤、名稱、modal、價格選單）都帶 data-en/data-zh，
    // 一次 applyLanguage 即可全部處理
    if (e.data && e.data.type === 'lovely-language') {
      if (window.LovelyI18n && e.data.lang) {
        window.LovelyI18n.applyLanguage(e.data.lang, document);
      }
      return;
    }
    
    // Admin: reorder by moving DOM elements (avoids full re-render which breaks images)
    if (e.data && e.data.type === 'admin-gallery-reorder-dom') {
      var container = document.querySelector('.gallery-grid');
      if (!container) return;
      var items = container.querySelectorAll('.gallery-item');
      var from = e.data.fromIndex;
      var to = e.data.toIndex;
      if (typeof from !== 'number' || typeof to !== 'number') return;
      if (from < 0 || to < 0 || from >= items.length || to >= items.length) return;
      var movedEl = items[from];
      // Remove and re-insert at the correct position
      container.removeChild(movedEl);
      var newItems = container.querySelectorAll('.gallery-item');
      if (to >= newItems.length) {
        container.appendChild(movedEl);
      } else {
        container.insertBefore(movedEl, newItems[to]);
      }
      // Update data-index attributes
      container.querySelectorAll('.gallery-item').forEach(function (el, i) {
        el.dataset.index = i;
      });
      return;
    }

    // Admin: full re-render (for upload/delete — use sparingly)
    if (e.data && e.data.type === 'admin-gallery-update' && Array.isArray(e.data.items)) {
      var container2 = document.querySelector('.gallery-grid');
      if (container2) {
        renderGallery(e.data.items, container2);
        if (window.LovelyI18n) {
          window.LovelyI18n.applyLanguage(localStorage.getItem('language') || 'zh');
        }
      }
      return;
    }

    // 處理滾動到指定索引的消息
    if (e.data && e.data.type === 'gallery-scroll-to') {
      const { index } = e.data;
      if (typeof index !== 'number' || index < 0) {
        return;
      }
      
      // 找到對應的圖片元素並滾動到該位置
      const container = document.querySelector('.gallery-grid');
      if (!container) return;
      
      const items = container.querySelectorAll('.gallery-item');
      if (index < items.length) {
        const targetItem = items[index];
        // 使用 smooth scroll 滾動到該元素
        targetItem.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest' 
        });
        
        // 添加一個短暫的高亮效果，讓用戶知道這是新上傳的圖片
        targetItem.style.transition = 'box-shadow 0.3s ease';
        targetItem.style.boxShadow = '0 0 0 4px rgba(212, 165, 116, 0.6)';
        setTimeout(() => {
          targetItem.style.boxShadow = '';
        }, 2000);
      }
    }
    
    // 處理選取狀態的消息
    if (e.data && e.data.type === 'gallery-select') {
      const { index } = e.data;
      const container = document.querySelector('.gallery-grid');
      if (!container) return;
      
      const items = container.querySelectorAll('.gallery-item');
      
      // 移除之前的選取狀態
      if (currentSelectedIndex >= 0 && currentSelectedIndex < items.length) {
        items[currentSelectedIndex].classList.remove('selected');
      }
      
      // 設置新的選取狀態
      if (typeof index === 'number' && index >= 0 && index < items.length) {
        items[index].classList.add('selected');
        currentSelectedIndex = index;
      } else {
        // index 為 -1 或無效值，表示取消選取
        currentSelectedIndex = -1;
      }
    }

    // 批次刪除模式
    if (e.data && e.data.type === 'batch-mode') {
      const container = document.querySelector('.gallery-grid');
      if (!container) return;
      if (e.data.enabled) {
        container.classList.add('batch-mode');
        // 在批次模式下，點擊切換勾選
        container.addEventListener('click', batchClickHandler, true);
      } else {
        container.classList.remove('batch-mode');
        container.removeEventListener('click', batchClickHandler, true);
        container.querySelectorAll('.gallery-item').forEach(function (el) {
          el.classList.remove('batch-selected');
        });
      }
    }
  });

  function batchClickHandler(e) {
    var itemEl = e.target.closest('.gallery-item');
    if (!itemEl) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    itemEl.classList.toggle('batch-selected');
    var index = Array.from(itemEl.parentElement.querySelectorAll('.gallery-item')).indexOf(itemEl);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'batch-toggle', index: index }, '*');
    }
  }

  window.LovelyGalleryLoader = {
    init: initGallery,
  };

  // Auto-init: detect gallery type from data attribute on .gallery-grid
  // This allows using defer on the script tag without needing an inline script.
  // Usage: <div class="gallery-grid" data-gallery-type="seasonal">
  function autoInit() {
    var container = document.querySelector('.gallery-grid[data-gallery-type]');
    if (container) {
      initGallery(container.getAttribute('data-gallery-type'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();

