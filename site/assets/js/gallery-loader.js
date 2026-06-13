// Gallery loader for seasonal.html and all-items.html
// Dynamically loads images from JSON data files
(function () {
  if (window.LovelyGalleryLoader) return;

  // 「本週切片」不是直接顯示某個資料檔，而是從 sets-data.json 的 weeklySlices
  // 取出 product 圖片路徑，再到 products-data.json 比對出對應商品。
  // 用統一判斷取代散落的字串比對：本週切片不顯示標籤 UI、只顯示切片價。
  function showsTagUI(type) { return type !== 'sets' && type !== 'weekly-slices'; }
  function sliceOnlyPrice(type) { return type === 'weekly-slices'; }

  // 組出某個 data 檔的 fetch URL（沿用 file:// fallback 與 adminPreview 時間戳）
  function dataFileUrl(name) {
    const isLocalFile = window.location.protocol === 'file:';
    let url = isLocalFile
      ? `https://raw.githubusercontent.com/lovelycakery/lovelycakery/main/site/assets/data/${name}`
      : `assets/data/${name}`;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('adminPreview') === '1') {
      url += (url.includes('?') ? '&' : '?') + 'ts=' + Date.now();
    }
    return url;
  }

  async function fetchData(name) {
    const response = await fetch(dataFileUrl(name));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  // 依 weeklySlices 路徑陣列，從來源品項取出對應商品（保持選取順序，略過找不到的）
  function resolveWeeklySlices(slicePaths, sourceItems) {
    if (!Array.isArray(slicePaths) || !Array.isArray(sourceItems)) return [];
    const byImage = new Map(sourceItems.map(it => [it.image, it]));
    return slicePaths.map(p => byImage.get(p)).filter(Boolean);
  }

  async function loadGalleryData(type) {
    try {
      if (type === 'weekly-slices') {
        // 來源：全部品項 + 新品上市（image 路徑當參照鍵）
        const [setsData, productsData, seasonalData] = await Promise.all([
          fetchData('sets-data.json'),
          fetchData('products-data.json'),
          fetchData('seasonal-data.json'),
        ]);
        const slicePaths = setsData && Array.isArray(setsData.weeklySlices) ? setsData.weeklySlices : [];
        const sourceItems = []
          .concat(productsData && Array.isArray(productsData.items) ? productsData.items : [])
          .concat(seasonalData && Array.isArray(seasonalData.items) ? seasonalData.items : []);
        return resolveWeeklySlices(slicePaths, sourceItems);
      }
      const data = await fetchData(`${type}-data.json`);
      return data && Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      console.warn(`Failed to load ${type} data:`, e);
      return null;
    }
  }

  // 目前開啟的 modal 狀態（admin 修改子圖時用來原地刷新）
  let activeModalRef = null;

  function createImageModal(item, type, opts) {
    opts = opts || {};
    const itemIndex = (typeof opts.index === 'number') ? opts.index : -1;
    const initialSlide = (typeof opts.initialSlide === 'number') ? opts.initialSlide : 0;
    const skipHistory = !!opts.skipHistory;

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

    // 生成標籤 HTML，支持國際化（sets / 本週切片 不顯示標籤）
    let tagsHTML = '';
    if (showsTagUI(type) && item.tags && item.tags.length > 0) {
      const tags = item.tags.map(tag => {
        const tagText = getTagText(tag, currentLang);
        const tagTextZh = TAG_I18N[tag] ? TAG_I18N[tag].zh : tag;
        const tagTextEn = TAG_I18N[tag] ? TAG_I18N[tag].en : tag;
        const color = TAG_COLORS[tag] || TAG_COLOR_DEFAULT;
        const colorStyle = `background-color: ${color.bg}; color: ${color.text}; box-shadow: 0 2px 8px ${color.shadow}; --tag-bg-color: ${color.bg};`;
        return `<span class="tag-badge image-modal__tag" data-en="${tagTextEn}" data-zh="${tagTextZh}" data-tag-key="${tag}" style="${colorStyle}">${tagText}</span>`;
      }).join('');
      tagsHTML = `<div class="image-modal__tags">${tags}</div>`;
    }

    // 處理價格顯示（直接列出所有尺寸價格）
    let priceHTML = '';
    if (item.prices && typeof item.prices === 'object') {
      const prices = item.prices;
      // 本週切片是「切片」組合，只顯示切片價
      const sliceOnly = sliceOnlyPrice(type);
      const size6 = sliceOnly ? '' : (prices.size6 || '');
      const size8 = sliceOnly ? '' : (prices.size8 || '');
      const slice = prices.slice || '';

      if (size6 || size8 || slice) {
        const priceItems = [];
        if (size6) {
          priceItems.push(`<span class="image-modal__price-item"><span class="image-modal__price-label" data-en="${getSizeText('size6', 'en')}" data-zh="${getSizeText('size6', 'zh')}">${getSizeText('size6', currentLang)}</span><span class="image-modal__price-value">NT$ ${size6}</span></span>`);
        }
        if (size8) {
          priceItems.push(`<span class="image-modal__price-item"><span class="image-modal__price-label" data-en="${getSizeText('size8', 'en')}" data-zh="${getSizeText('size8', 'zh')}">${getSizeText('size8', currentLang)}</span><span class="image-modal__price-value">NT$ ${size8}</span></span>`);
        }
        if (slice) {
          priceItems.push(`<span class="image-modal__price-item"><span class="image-modal__price-label" data-en="${getSizeText('slice', 'en')}" data-zh="${getSizeText('slice', 'zh')}">${getSizeText('slice', currentLang)}</span><span class="image-modal__price-value">NT$ ${slice}</span></span>`);
        }

        priceHTML = `
          <div class="image-modal__price-section">
            <div class="image-modal__price-list">
              ${priceItems.join('')}
            </div>
          </div>
        `;
      }
    }

    // 收集主圖 + 子圖（優先使用 _previewUrl 做即時預覽，未提供則用實際路徑）
    // _subImagesPreview 對應 subImages 順序，未上傳的條目為 falsy
    const slideEntries = [];
    slideEntries.push({ src: item._previewUrl || item.image, alt: itemName });
    if (Array.isArray(item.subImages)) {
      item.subImages.forEach((p, i) => {
        const previewArr = Array.isArray(item._subImagesPreview) ? item._subImagesPreview : [];
        slideEntries.push({ src: previewArr[i] || p, alt: itemName + ' - ' + (i + 2) });
      });
    }
    const totalSlides = slideEntries.length;
    const hasMultiple = totalSlides > 1;

    const slidesHTML = slideEntries.map((s) => (
      `<img src="${s.src}" alt="${s.alt}" class="image-modal__slide" draggable="false">`
    )).join('');

    let navHTML = '';
    let dotsHTML = '';
    if (hasMultiple) {
      navHTML = `
        <button class="image-modal__nav image-modal__nav--prev" aria-label="上一張" type="button">&#10094;</button>
        <button class="image-modal__nav image-modal__nav--next" aria-label="下一張" type="button">&#10095;</button>
        <div class="image-modal__zone image-modal__zone--prev" aria-hidden="true"></div>
        <div class="image-modal__zone image-modal__zone--next" aria-hidden="true"></div>
      `;
      dotsHTML = '<div class="image-modal__dots">' +
        slideEntries.map((_, i) => `<span class="image-modal__dot${i === 0 ? ' is-active' : ''}" data-index="${i}"></span>`).join('') +
        '</div>';
    }

    modal.innerHTML = `
      <div class="image-modal__overlay"></div>
      <div class="image-modal__content">
        <button class="image-modal__close" aria-label="關閉">&times;</button>
        <div class="image-modal__image-wrapper${hasMultiple ? ' has-multiple' : ''}">
          <div class="image-modal__slides">${slidesHTML}</div>
          ${navHTML}
          ${dotsHTML}
        </div>
        <div class="image-modal__info">
          <h3 class="image-modal__name" data-en="${itemNameEn}" data-zh="${itemNameZh}">${itemName}</h3>
          ${priceHTML}
          ${itemDescription ? `<p class="image-modal__description" data-en="${itemDescriptionEn}" data-zh="${itemDescriptionZh}">${itemDescription}</p>` : ''}
          ${tagsHTML}
        </div>
      </div>
    `;

    let modalOpen = true;
    let currentSlide = Math.max(0, Math.min(initialSlide, totalSlides - 1));

    const slidesTrack = modal.querySelector('.image-modal__slides');
    const dotEls = modal.querySelectorAll('.image-modal__dot');

    function applyTrackTransform(idx, dragOffsetPx) {
      // 用 calc：基底是 -idx*100%、加上拖曳的像素位移
      const base = -idx * 100;
      const offset = dragOffsetPx || 0;
      slidesTrack.style.transform = `translateX(calc(${base}% + ${offset}px))`;
    }

    function showSlide(idx) {
      if (idx < 0) idx = totalSlides - 1;
      if (idx >= totalSlides) idx = 0;
      currentSlide = idx;
      applyTrackTransform(idx, 0);
      dotEls.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    }

    // 初始位置（不跑動畫）
    // 暫時關掉 transition，避免 initialSlide > 0 時看到滑動軌跡
    const prevTransition = slidesTrack.style.transition;
    slidesTrack.style.transition = 'none';
    applyTrackTransform(currentSlide, 0);
    dotEls.forEach((el, i) => el.classList.toggle('is-active', i === currentSlide));
    // 強制 reflow 後恢復 transition
    void slidesTrack.offsetWidth;
    slidesTrack.style.transition = prevTransition;

    if (hasMultiple) {
      modal.querySelector('.image-modal__nav--prev').addEventListener('click', (ev) => { ev.stopPropagation(); showSlide(currentSlide - 1); });
      modal.querySelector('.image-modal__nav--next').addEventListener('click', (ev) => { ev.stopPropagation(); showSlide(currentSlide + 1); });
      modal.querySelector('.image-modal__zone--prev').addEventListener('click', (ev) => { ev.stopPropagation(); showSlide(currentSlide - 1); });
      modal.querySelector('.image-modal__zone--next').addEventListener('click', (ev) => { ev.stopPropagation(); showSlide(currentSlide + 1); });
      dotEls.forEach((dot) => {
        dot.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = parseInt(dot.dataset.index, 10);
          if (!isNaN(idx)) showSlide(idx);
        });
      });

      // Touch swipe：手指拖曳時即時跟著動，放開依位移決定切換或回彈
      const wrapper = modal.querySelector('.image-modal__image-wrapper');
      let touchStartX = 0;
      let touchStartY = 0;
      let touchActive = false;
      let touchAxis = null; // 'h' / 'v' / null（尚未決定）

      wrapper.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1) return;
        touchActive = true;
        touchAxis = null;
        touchStartX = ev.touches[0].clientX;
        touchStartY = ev.touches[0].clientY;
      }, { passive: true });

      wrapper.addEventListener('touchmove', (ev) => {
        if (!touchActive || ev.touches.length !== 1) return;
        const dx = ev.touches[0].clientX - touchStartX;
        const dy = ev.touches[0].clientY - touchStartY;
        // 第一次明確判斷主軸：避免手指原本想垂直捲動但被誤判成水平
        if (touchAxis === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // 還太小，先不判
          touchAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
          if (touchAxis === 'h') slidesTrack.classList.add('is-dragging');
        }
        if (touchAxis !== 'h') return;
        // 邊界減阻：第一張往右拖、最後一張往左拖時，位移打 0.35 折
        let drag = dx;
        if ((currentSlide === 0 && dx > 0) || (currentSlide === totalSlides - 1 && dx < 0)) {
          drag = dx * 0.35;
        }
        if (ev.cancelable) ev.preventDefault();
        applyTrackTransform(currentSlide, drag);
      }, { passive: false });

      wrapper.addEventListener('touchend', (ev) => {
        if (!touchActive) return;
        touchActive = false;
        slidesTrack.classList.remove('is-dragging');
        if (touchAxis !== 'h') return;
        const t = ev.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const threshold = wrapper.offsetWidth * 0.18; // 約 18% 寬度為切換門檻
        if (dx <= -threshold && currentSlide < totalSlides - 1) {
          showSlide(currentSlide + 1);
        } else if (dx >= threshold && currentSlide > 0) {
          showSlide(currentSlide - 1);
        } else {
          // 不夠或在邊界 → 回彈到原位
          applyTrackTransform(currentSlide, 0);
        }
      });

      wrapper.addEventListener('touchcancel', () => {
        if (!touchActive) return;
        touchActive = false;
        slidesTrack.classList.remove('is-dragging');
        applyTrackTransform(currentSlide, 0);
      });
    }

    const closeModal = () => {
      if (!modalOpen) return;
      modalOpen = false;
      if (modal.parentNode) document.body.removeChild(modal);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('popstate', popstateHandler);
      if (activeModalRef && activeModalRef.modal === modal) activeModalRef = null;
    };

    // X / overlay / Escape 關閉時，要 history.back() 消掉 pushState 的記錄
    // 但若這個 modal 是「無感刷新」開啟的（skipHistory），就不要 back
    const closeAndBack = () => {
      if (!modalOpen) return;
      const needsBack = !skipHistory;
      closeModal();
      if (needsBack) history.back();
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') { closeAndBack(); return; }
      if (hasMultiple && e.key === 'ArrowLeft') { e.preventDefault(); showSlide(currentSlide - 1); }
      if (hasMultiple && e.key === 'ArrowRight') { e.preventDefault(); showSlide(currentSlide + 1); }
    };

    // 手機滑返回 / 返回鍵 → popstate 觸發 → 關閉 modal
    const popstateHandler = () => {
      if (modalOpen) closeModal();
    };

    // overlay 改為 pointer-events: none，由外層 modal 偵測點擊背景關閉
    modal.addEventListener('click', (e) => {
      if (!e.target.closest('.image-modal__content')) closeAndBack();
    });
    modal.querySelector('.image-modal__close').addEventListener('click', closeAndBack);
    document.addEventListener('keydown', keyHandler);
    window.addEventListener('popstate', popstateHandler);

    // 推一筆歷史記錄，讓返回手勢可以攔截（無感刷新時跳過，沿用原本那筆）
    if (!skipHistory) history.pushState({ modal: true }, '');

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // 登記目前開啟的 modal，admin 修改子圖時可原地刷新
    activeModalRef = {
      modal: modal,
      itemIndex: itemIndex,
      type: type,
      getCurrentSlide: () => currentSlide,
      silentClose: closeModal,
    };
  }

  // 標籤顏色定義（精緻可愛風格 - 單色）
  const TAG_COLORS = {
    '奶蛋素': {
      bg: '#d4edd0',
      text: '#4d8050',
      shadow: 'rgba(106, 171, 136, 0.25)'
    },      // 粉綠便利貼
    '無咖啡因': {
      bg: '#c6e0ee',
      text: '#3d7a9e',
      shadow: 'rgba(122, 173, 197, 0.25)'
    },    // 粉藍便利貼
    '無酒精': {
      bg: '#f8d4c4',
      text: '#a05a45',
      shadow: 'rgba(212, 135, 106, 0.25)'
    },      // 粉橘便利貼
  };

  const TAG_COLOR_DEFAULT = {
    bg: '#e8e0f0',
    text: '#6b5a8a',
    shadow: 'rgba(150, 130, 180, 0.25)'
  };

  // 標籤中英文對應
  const TAG_I18N = {
    '奶蛋素': { zh: '奶蛋素', en: 'Vegetarian' },
    '無咖啡因': { zh: '無咖啡因', en: 'Caffeine-Free' },
    '無酒精': { zh: '無酒精', en: 'Alcohol-Free' },
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

  // 篩選圖片（若提供 container 則只篩選該 grid 內的項目，否則全頁）
  function filterGallery(selectedTags, container) {
    const root = container || document;
    const items = root.querySelectorAll('.gallery-item');

    let visibleCount = 0;
    items.forEach(item => {
      let visible = true;
      if (selectedTags.length > 0) {
        const itemTags = item.dataset.tags ? item.dataset.tags.split(',') : [];
        visible = selectedTags.every(tag => itemTags.includes(tag));
      }
      item.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    });

    // 無符合商品時顯示提示（放 grid 之後當 block-level 元素，確保跨整列、左右置中）
    if (container && container.classList && container.classList.contains('gallery-grid')) {
      const grid = container;
      const next = grid.nextElementSibling;
      let msg = (next && next.classList && next.classList.contains('gallery-empty-msg')) ? next : null;
      const showMsg = items.length > 0 && visibleCount === 0;
      if (showMsg) {
        // 把 grid 的 padding-bottom 收掉，讓提示緊貼分隔線下方
        grid.classList.add('is-filtered-empty');
        if (!msg) {
          const lang = localStorage.getItem('language') || 'zh';
          msg = document.createElement('p');
          msg.className = 'gallery-empty-msg';
          msg.setAttribute('data-en', 'No items match.');
          msg.setAttribute('data-zh', '目前沒有符合的商品喔～');
          msg.textContent = lang === 'en' ? 'No items match.' : '目前沒有符合的商品喔～';
          grid.parentNode.insertBefore(msg, grid.nextSibling);
          if (window.LovelyI18n) window.LovelyI18n.applyLanguage(lang, msg);
        } else {
          msg.style.display = '';
        }
      } else {
        grid.classList.remove('is-filtered-empty');
        if (msg) msg.style.display = 'none';
      }
    }
  }

  // 渲染圖例（可勾選）
  function renderTagLegend(container) {
    // 移除這個 grid 對應的舊圖例（grid 的前一個 sibling）
    const prevSibling = container.previousElementSibling;
    if (prevSibling && prevSibling.classList && prevSibling.classList.contains('tag-legend')) {
      prevSibling.remove();
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
            <span class="tag-badge tag-legend-badge" data-en="${tagTextEn}" data-zh="${tagTextZh}" style="background-color: ${color.bg}; color: ${color.text}; box-shadow: 0 2px 8px ${color.shadow}; --tag-bg-color: ${color.bg};">${tagText}</span>
          </label>
        </div>
      `;
    }).join('');

    legend.innerHTML = `
      <div class="tag-legend-items">${legendItems}<span class="tag-legend-hint" data-en="clickable" data-zh="可勾選">可勾選</span></div>
    `;

    // 插入到 grid 之前（每個 grid 自己的圖例）
    container.parentNode.insertBefore(legend, container);

    // 綁定 checkbox 事件（篩選範圍限定在這個 grid 內）
    const checkboxes = legend.querySelectorAll('.tag-legend-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const selectedTags = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);
        filterGallery(selectedTags, container);
      });
    });

    // 應用語言（如果 i18n 已載入）
    if (window.LovelyI18n) {
      const currentLang = localStorage.getItem('language') || 'zh';
      window.LovelyI18n.applyLanguage(currentLang, legend);
    }
  }

  // 渲染圖片標籤（右下角）
  function renderImageTags(imageWrapper, tags) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) return;

    // 獲取當前語言
    const currentLang = localStorage.getItem('language') || 'zh';

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'gallery-image-tags';

    tags.forEach(tag => {
      const color = TAG_COLORS[tag] || TAG_COLOR_DEFAULT;
      const tagText = getTagText(tag, currentLang);
      const tagTextZh = TAG_I18N[tag] ? TAG_I18N[tag].zh : tag;
      const tagTextEn = TAG_I18N[tag] ? TAG_I18N[tag].en : tag;
      const tagBadge = document.createElement('span');
      tagBadge.className = 'tag-badge gallery-image-tag';
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

  function renderGallery(items, container, type, options) {
    options = options || {};
    container.innerHTML = '';

    // 獲取當前語言
    const currentLang = localStorage.getItem('language') || 'zh';

    // 檢測是否為 admin 模式，以及是編輯模式還是預覽模式
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.get('adminPreview') === '1';
    const adminMode = urlParams.get('mode'); // 'edit' 或 'preview'
    // 只有在編輯模式下才啟用拖曳和點擊編輯。
    // 本週切片（weekly-slices）由 admin 的勾選清單控制，不可在預覽 iframe 內拖曳/點擊編輯，
    // 否則送出的索引會被誤認為 sets 清單的索引。
    const isEditMode = isAdminMode && adminMode === 'edit' && type !== 'weekly-slices';

    // 渲染圖例（在頁面上方；sets / 本週切片 不需要標籤圖例）
    // 合併版（autoInit 已 render 共享 legend）會傳 skipLegend，避免重複
    if (showsTagUI(type) && !options.skipLegend) {
      renderTagLegend(container);
    }
    
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
      
      // 將標籤儲存到 data 屬性中，用於篩選（sets / 本週切片 不需要）
      if (showsTagUI(type) && item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        itemEl.dataset.tags = item.tags.join(',');
      }
      
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'gallery-image-wrapper';
      const img = document.createElement('img');
      // 先不設 src，由 IntersectionObserver 觸發載入
      img.dataset.src = imageSrc;
      if (!item._previewUrl && imageSrc.includes('/products/')) {
        const smSrc = imageSrc.replace('/products/', '/products/sm/');
        img.dataset.srcset = smSrc + ' 480w, ' + imageSrc + ' 1000w';
        img.dataset.sizes = '(max-width: 768px) 50vw, 500px';
      }
      img.alt = imageAlt;
      img.className = 'gallery-image';
      img.decoding = 'async';
      img.width = 1000;
      img.height = 1000;
      img.onload = () => imageWrapper.classList.add('loaded');
      imageWrapper.appendChild(img);

      // 如果有標籤，在圖片上顯示標籤（sets / 本週切片 不需要）
      if (showsTagUI(type) && item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
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
          const toIndex = itemEl.dataset.index !== undefined ? parseInt(itemEl.dataset.index, 10) : index;
          
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

          e.preventDefault();
          e.stopPropagation();

          // 通知父窗口打開編輯面板
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'gallery-edit',
              index: index,
            }, '*');
          } else {
            console.warn('Cannot send edit message: not in iframe context');
          }

          // 點擊圖片時也開啟 modal（與公開頁一致，方便預覽子圖）
          // 點到名稱列（itemInfo）時不開
          if (e.target.closest('.gallery-image-wrapper')) {
            createImageModal(item, type, { index: index });
          }
        });
      } else {
        // 非編輯模式（包括預覽模式和訪客模式）：只有點圖片才開 modal
        imageWrapper.addEventListener('click', () => {
          createImageModal(item, type, { index: index });
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

  async function initGallery(type, options) {
    options = options || {};
    // 精確選取對應 type 的 grid（同頁可能有多個 grid）
    const container = document.querySelector('.gallery-grid[data-gallery-type="' + type + '"]')
      || document.querySelector('.gallery-grid');
    if (!container) return;

    const items = await loadGalleryData(type);

    // 「本週切片」特例：沒有任何切片（空陣列）或載入失敗時，整段隱藏，不顯示「籌備中」
    if (type === 'weekly-slices') {
      var section = document.getElementById('weeklySlicesSection');
      if (!items || items.length === 0) {
        if (section) section.style.display = 'none';
        container.innerHTML = '';
        return;
      }
      if (section) section.style.display = '';
      renderGallery(items, container, type, options);
      setupLazyImages(container);
      if (window.LovelyI18n) window.LovelyI18n.applyLanguage(localStorage.getItem('language') || 'zh', section);
      return;
    }

    if (items === null) {
      const lang = localStorage.getItem('language') || 'zh';
      container.innerHTML = '<p style="text-align:center;padding:40px;color:#6b5d4f;font-size:16px;" data-en="Unable to load content. Please try again later." data-zh="無法載入內容，請稍後再試。">' +
        (lang === 'en' ? 'Unable to load content. Please try again later.' : '無法載入內容，請稍後再試。') + '</p>';
      return;
    }
    if (items.length === 0) {
      // 載入手寫字體（英文用，display=swap 不阻塞渲染）
      if (!document.querySelector('link[href*="Dancing+Script"]')) {
        var fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500;700&display=swap';
        document.head.appendChild(fontLink);
      }
      // 注入樣式：透過 html[lang] 自動跟隨 i18n 語言切換
      if (!document.getElementById('coming-soon-styles')) {
        var style = document.createElement('style');
        style.id = 'coming-soon-styles';
        style.textContent =
          '.main-content:has(.gallery-coming-soon){display:flex;flex-direction:column;}' +
          '.main-content:has(.gallery-coming-soon) .container{flex:1;display:flex;flex-direction:column;}' +
          '.gallery-grid:has(.gallery-coming-soon){flex:1;display:flex;align-items:center;justify-content:center;}' +
          '.gallery-coming-soon{text-align:center;padding:40px;color:#d4809a;letter-spacing:1px;font-size:28px;font-family:"Playfair Display",serif;font-weight:400;}' +
          'html[lang="en"] .gallery-coming-soon{font-size:36px;font-family:"Dancing Script",cursive;font-weight:600;}' +
          '@media(max-width:768px){.gallery-coming-soon{font-size:20px;padding:24px;}html[lang="en"] .gallery-coming-soon{font-size:24px;}}';
        document.head.appendChild(style);
      }
      // 文字由 i18n.js 透過 data-en/data-zh 自動切換，這裡只需設定初始值
      var lang = localStorage.getItem('language') || 'zh';
      container.innerHTML = '<p class="gallery-coming-soon" data-en="Coming Soon — Stay Tuned!" data-zh="🍰 新品籌備中，敬請期待～ ✨">' +
        (lang === 'en' ? 'Coming Soon — Stay Tuned!' : '🍰 新品籌備中，敬請期待～ ✨') + '</p>';
      return;
    }
    renderGallery(items, container, type, options);
    setupLazyImages(container);
  }

  // 用 IntersectionObserver 控制圖片載入，避免同時發出太多請求
  // 注意：每次 renderGallery 重建 DOM 後都要重新呼叫，否則新的 img[data-src] 不會被載入
  function setupLazyImages(container) {
    const lazyImages = container.querySelectorAll('img[data-src]');
    if (lazyImages.length === 0) return;
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
            img.sizes = img.dataset.sizes;
          }
          imageObserver.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });
    lazyImages.forEach(img => imageObserver.observe(img));
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
      var rType = e.data.galleryType
        || (document.querySelector('.gallery-grid[data-gallery-type]') && document.querySelector('.gallery-grid[data-gallery-type]').getAttribute('data-gallery-type'))
        || 'products';
      var container = document.querySelector('.gallery-grid[data-gallery-type="' + rType + '"]')
        || document.querySelector('.gallery-grid');
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
      // 在合併版（test mode）有多個 grid，要用 galleryType 精確找到對應 grid，
      // 否則會把 products 資料寫進 seasonal grid 等錯誤
      var galleryType = e.data.galleryType
        || (document.querySelector('.gallery-grid[data-gallery-type]') && document.querySelector('.gallery-grid[data-gallery-type]').getAttribute('data-gallery-type'))
        || 'products';
      var container2 = document.querySelector('.gallery-grid[data-gallery-type="' + galleryType + '"]');
      if (container2) {
        var allGrids = document.querySelectorAll('.gallery-grid[data-gallery-type]');
        var isMergedView = allGrids.length > 1;
        // 合併版要 skipLegend，避免重複塞圖例
        renderGallery(e.data.items, container2, galleryType, { skipLegend: isMergedView });
        // 重要：renderGallery 會清掉舊 DOM、重建 img[data-src]，必須重新掛 IntersectionObserver
        // 否則新的 img 永遠不會被觸發載入（會卡在 spinner）
        setupLazyImages(container2);
        if (window.LovelyI18n) {
          window.LovelyI18n.applyLanguage(localStorage.getItem('language') || 'zh');
        }
        // 若目前有開啟的 modal，原地刷新（沿用原本的 history 記錄與 slide 位置）
        if (activeModalRef && activeModalRef.type === galleryType
            && typeof activeModalRef.itemIndex === 'number'
            && activeModalRef.itemIndex >= 0 && activeModalRef.itemIndex < e.data.items.length) {
          var prevIndex = activeModalRef.itemIndex;
          var prevType = activeModalRef.type;
          var prevSlide = activeModalRef.getCurrentSlide();
          var newItem = e.data.items[prevIndex];
          activeModalRef.silentClose();
          createImageModal(newItem, prevType, {
            index: prevIndex,
            initialSlide: prevSlide,
            skipHistory: true,
          });
        }
      }
      return;
    }

    // Admin: 本週切片即時更新（admin 已解析好對應的 product items）
    if (e.data && e.data.type === 'admin-weekly-slices-update' && Array.isArray(e.data.items)) {
      var wsSection = document.getElementById('weeklySlicesSection');
      var wsContainer = document.querySelector('.gallery-grid[data-gallery-type="weekly-slices"]');
      if (!wsContainer) return;
      if (e.data.items.length === 0) {
        if (wsSection) wsSection.style.display = 'none';
        wsContainer.innerHTML = '';
        return;
      }
      if (wsSection) wsSection.style.display = '';
      renderGallery(e.data.items, wsContainer, 'weekly-slices', {});
      setupLazyImages(wsContainer);
      if (window.LovelyI18n) {
        window.LovelyI18n.applyLanguage(localStorage.getItem('language') || 'zh', wsSection || document);
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

  // 共享圖例：合併頁（多 grid）才用。一個 legend 控制所有 grid 的篩選。
  function renderSharedLegend(grids) {
    // 移除任何既有 legend，確保只剩一個共享版
    document.querySelectorAll('.tag-legend').forEach(function (el) { el.remove(); });

    var currentLang = localStorage.getItem('language') || 'zh';

    var legend = document.createElement('div');
    legend.className = 'tag-legend tag-legend--shared';

    var legendItems = Object.keys(TAG_COLORS).map(function (tag) {
      var color = TAG_COLORS[tag];
      var tagText = getTagText(tag, currentLang);
      var tagTextZh = TAG_I18N[tag] ? TAG_I18N[tag].zh : tag;
      var tagTextEn = TAG_I18N[tag] ? TAG_I18N[tag].en : tag;
      return '<div class="tag-legend-item">' +
          '<label class="tag-legend-checkbox-label">' +
            '<input type="checkbox" class="tag-legend-checkbox" value="' + tag + '" data-tag="' + tag + '">' +
            '<span class="tag-badge tag-legend-badge" data-en="' + tagTextEn + '" data-zh="' + tagTextZh + '" style="background-color: ' + color.bg + '; color: ' + color.text + '; box-shadow: 0 2px 8px ' + color.shadow + '; --tag-bg-color: ' + color.bg + ';">' + tagText + '</span>' +
          '</label>' +
        '</div>';
    }).join('');

    legend.innerHTML = '<div class="tag-legend-items">' + legendItems +
      '<span class="tag-legend-hint" data-en="clickable" data-zh="可勾選">可勾選</span></div>';

    // 插入到 .order-tags 之後（fixed nav 底下），fallback 放第一個 grid 之前
    var anchor = document.querySelector('.order-tags');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(legend, anchor.nextSibling);
    } else if (grids[0] && grids[0].parentNode) {
      grids[0].parentNode.insertBefore(legend, grids[0]);
    }

    // 綁 checkbox：篩選同步套到所有 grid
    var checkboxes = legend.querySelectorAll('.tag-legend-checkbox');
    checkboxes.forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        var selectedTags = Array.from(checkboxes)
          .filter(function (cb) { return cb.checked; })
          .map(function (cb) { return cb.value; });
        grids.forEach(function (grid) {
          filterGallery(selectedTags, grid);
        });
      });
    });

    if (window.LovelyI18n) {
      window.LovelyI18n.applyLanguage(currentLang, legend);
    }
  }

  // Auto-init: detect gallery type from data attribute on .gallery-grid
  // This allows using defer on the script tag without needing an inline script.
  // Usage: <div class="gallery-grid" data-gallery-type="seasonal">
  // 支援同頁多個 grid（例如 all-items.html admin 預覽合併版）
  function autoInit() {
    var containers = Array.from(document.querySelectorAll('.gallery-grid[data-gallery-type]'));
    // 只有「會顯示標籤圖例」的 grid 才算合併版（sets / weekly-slices 不算）。
    // 否則 sets.html 有 sets + weekly-slices 兩個 grid 會被誤判成合併版而塞共享圖例。
    var tagGrids = containers.filter(function (c) { return showsTagUI(c.getAttribute('data-gallery-type')); });
    var isMergedView = tagGrids.length > 1;

    // 合併版：先 render 共享 legend（內容 hard-coded，不需等 fetch），各 grid 再 init 時 skip 自己的 legend
    if (isMergedView) {
      renderSharedLegend(tagGrids);
    }

    containers.forEach(function (container) {
      initGallery(container.getAttribute('data-gallery-type'), { skipLegend: isMergedView });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();

