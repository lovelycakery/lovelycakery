// Gallery loader for seasonal.html and all-items.html
// Dynamically loads images from JSON data files
(function () {
  if (window.LovelyGalleryLoader) return;

  async function loadGalleryData(type) {
    // 優先使用本地 JSON 檔案（無論是 file:// 還是 http://）
    const dataFile = `assets/data/${type}-data.json`;
    
    try {
      const response = await fetch(dataFile);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data && Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      console.warn(`Failed to load ${type} data from local file, trying GitHub...`, e);
      // 如果本地載入失敗（例如在 GitHub Pages），嘗試從 GitHub 載入
      try {
        const githubFile = `https://raw.githubusercontent.com/lovelycakery/lovelycakery/main/site/assets/data/${type}-data.json`;
        const response = await fetch(githubFile);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data && Array.isArray(data.items) ? data.items : [];
      } catch (e2) {
        console.warn(`Failed to load ${type} data from GitHub:`, e2);
        return [];
      }
    }
  }

  function createImageModal(item) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
      <div class="image-modal__overlay"></div>
      <div class="image-modal__content">
        <button class="image-modal__close" aria-label="關閉">&times;</button>
        <div class="image-modal__image-wrapper">
          <img src="${item.image}" alt="${item.name}" class="image-modal__image">
        </div>
        <div class="image-modal__info">
          <h3 class="image-modal__name">${item.name || '未命名'}</h3>
          ${item.price ? `<p class="image-modal__price">NT$ ${item.price}</p>` : ''}
          ${item.description ? `<p class="image-modal__description">${item.description}</p>` : ''}
          ${item.tags && item.tags.length > 0 ? `<div class="image-modal__tags">${item.tags.map(tag => `<span class="image-modal__tag">${tag}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    `;
    
    const closeModal = () => {
      document.body.removeChild(modal);
      document.body.style.overflow = '';
    };
    
    modal.querySelector('.image-modal__overlay').addEventListener('click', closeModal);
    modal.querySelector('.image-modal__close').addEventListener('click', closeModal);
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
  }

  function renderGallery(items, container) {
    container.innerHTML = '';
    
    // 檢測是否為 admin 模式，以及是編輯模式還是預覽模式
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.get('adminPreview') === '1';
    const adminMode = urlParams.get('mode'); // 'edit' 或 'preview'
    const isEditMode = isAdminMode && adminMode === 'edit'; // 只有在編輯模式下才啟用拖曳和點擊編輯
    
    items.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'gallery-item';
      
      // 處理圖片路徑：在 file:// 協議下，中文字符需要正確編碼
      // 但瀏覽器通常會自動處理，所以直接使用路徑即可
      const imageSrc = item.image;
      const imageAlt = item.name || 'Gallery image';
      const imageName = item.name || '未命名';
      
      itemEl.innerHTML = `
        <div class="gallery-image-wrapper">
          <img src="${imageSrc}" alt="${imageAlt}" class="gallery-image" loading="lazy" decoding="async" width="1600" height="1600">
        </div>
        <div class="gallery-item-info">
          <div class="gallery-item-name">${imageName}</div>
          ${item.price ? `<div class="gallery-item-price">NT$ ${item.price}</div>` : ''}
        </div>
      `;
      
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
        
        // 拖曳狀態追蹤：用於區分拖曳和點擊操作
        let dragStartTime = 0;  // 拖曳開始時間戳
        let hasDragged = false; // 是否實際發生了拖曳移動
        
        // 拖曳開始
        // 注意：必須重置 hasDragged，因為每次拖曳都是新的操作
        itemEl.addEventListener('dragstart', (e) => {
          dragStartTime = Date.now();
          hasDragged = false; // 重置：拖曳剛開始，還沒有移動
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', index.toString());
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
          const toIndex = index;
          
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
          content: '放置這裡';
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
      .gallery-item.selected .gallery-image-wrapper {
        box-shadow: 0 0 0 4px rgba(212, 165, 116, 0.8), 0 8px 24px rgba(212, 165, 116, 0.4);
        transform: translateY(-2px);
      }
      .gallery-item.selected::before {
        content: '已選取';
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
      .all-items-page .gallery-item.selected .gallery-image-wrapper {
        box-shadow: 0 0 0 4px rgba(212, 165, 116, 0.8), 0 4px 16px rgba(212, 165, 116, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // 監聽來自父窗口的消息（滾動和選取狀態）
  let currentSelectedIndex = -1; // 追蹤當前選取的圖片索引
  
  window.addEventListener('message', (e) => {
    // 安全檢查：接受來自同源或本地開發服務器的訊息
    // 在 Electron 環境中，origin 可能是 http://127.0.0.1:PORT
    const isSameOrigin = e.origin === window.location.origin;
    const isLocalhost = e.origin.startsWith('http://127.0.0.1:') || e.origin.startsWith('http://localhost:');
    if (!isSameOrigin && !isLocalhost) {
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
  });

  window.LovelyGalleryLoader = {
    init: initGallery,
  };
})();

