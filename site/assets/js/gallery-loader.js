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
    
    items.forEach((item) => {
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
      
      itemEl.addEventListener('click', () => {
        createImageModal(item);
      });
      
      container.appendChild(itemEl);
    });
  }

  async function initGallery(type) {
    const container = document.querySelector('.gallery-grid');
    if (!container) return;
    
    const items = await loadGalleryData(type);
    renderGallery(items, container);
  }

  window.LovelyGalleryLoader = {
    init: initGallery,
  };
})();

