/* global */

// Lovely Admin — Claude API translation helper
// Translates Chinese cake names/descriptions to English via Claude API.
(function () {
  'use strict';
  if (window.AdminTranslate) return;

  var API_KEY_STORAGE = 'lovely-admin-claude-api-key';
  var API_URL = 'https://api.anthropic.com/v1/messages';
  var MODEL = 'claude-haiku-4-5-20251001';

  function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  }

  function setApiKey(key) {
    localStorage.setItem(API_KEY_STORAGE, (key || '').trim());
  }

  function clearApiKey() {
    localStorage.removeItem(API_KEY_STORAGE);
  }

  function hasApiKey() {
    return !!getApiKey();
  }

  /**
   * Translate Chinese text to English using Claude API.
   * @param {string} zhName - Chinese product name
   * @param {string} zhDesc - Chinese product description (optional)
   * @returns {Promise<{name_en: string, description_en: string}>}
   */
  async function translate(zhName, zhDesc) {
    var key = getApiKey();
    if (!key) throw new Error('請先設定 Claude API Key');

    var parts = [];
    if (zhName) parts.push('名稱：' + zhName);
    if (zhDesc) parts.push('描述：' + zhDesc);
    if (parts.length === 0) throw new Error('沒有需要翻譯的內容');

    var systemPrompt = '你是蛋糕甜點翻譯專家。將繁體中文蛋糕品名與描述翻譯成自然、優雅的英文。' +
      '品名要簡潔（不超過 6 個字），描述要吸引人但忠於原意。' +
      '只回傳 JSON，格式：{"name_en":"...","description_en":"..."}' +
      '如果只有名稱沒有描述，description_en 留空字串。';

    var userMsg = parts.join('\n');

    var res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!res.ok) {
      var errBody = '';
      try { errBody = (await res.json()).error.message; } catch (_) { /* */ }
      if (res.status === 401) throw new Error('Claude API Key 無效，請重新設定');
      if (res.status === 429) throw new Error('API 額度已用盡或請求過於頻繁，請稍後再試');
      if (res.status === 403) throw new Error('API Key 權限不足，請確認 Key 是否正確');
      if (res.status === 400) throw new Error('請求格式錯誤' + (errBody ? '：' + errBody : ''));
      if (res.status === 500 || res.status === 502 || res.status === 503) throw new Error('Claude 服務暫時無法使用，請稍後再試');
      throw new Error('翻譯失敗 (' + res.status + ')' + (errBody ? '：' + errBody : ''));
    }

    var data = await res.json();
    var text = data.content && data.content[0] && data.content[0].text || '';

    // Extract JSON from response (handle possible markdown code blocks)
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('翻譯回傳格式異常');

    var result = JSON.parse(jsonMatch[0]);
    return {
      name_en: result.name_en || '',
      description_en: result.description_en || '',
    };
  }

  /**
   * Translate calendar item text (short label + optional detail).
   * @param {string} zhText - short label, e.g. 「休息」
   * @param {string} zhDetail - longer detail, e.g. 「花生OREO/檸檬草莓」
   * @returns {Promise<{text_en: string, detail_en: string}>}
   */
  async function translateCalendar(zhText, zhDetail) {
    var key = getApiKey();
    if (!key) throw new Error('請先設定 Claude API Key');
    var parts = [];
    if (zhText) parts.push('標籤：' + zhText);
    if (zhDetail) parts.push('詳細：' + zhDetail);
    if (parts.length === 0) throw new Error('沒有需要翻譯的內容');

    var systemPrompt = '你是蛋糕甜點店月曆翻譯助手。將繁體中文的月曆短標籤與詳細說明翻譯成自然簡潔的英文。' +
      '標籤要極簡（1–4 個字，例如「休息」→「Closed」、「本週切片口味」→「Slice flavors」），' +
      '詳細說明要忠於原意但通順。' +
      '只回傳 JSON，格式：{"text_en":"...","detail_en":"..."}' +
      '如果只有標籤沒有詳細，detail_en 留空字串。';

    var res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: parts.join('\n') }],
      }),
    });

    if (!res.ok) {
      var errBody = '';
      try { errBody = (await res.json()).error.message; } catch (_) { /* */ }
      if (res.status === 401) throw new Error('Claude API Key 無效，請重新設定');
      if (res.status === 429) throw new Error('API 額度已用盡或請求過於頻繁，請稍後再試');
      if (res.status === 403) throw new Error('API Key 權限不足，請確認 Key 是否正確');
      throw new Error('翻譯失敗 (' + res.status + ')' + (errBody ? '：' + errBody : ''));
    }

    var data = await res.json();
    var text = data.content && data.content[0] && data.content[0].text || '';
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('翻譯回傳格式異常');
    var result = JSON.parse(jsonMatch[0]);
    return {
      text_en: result.text_en || '',
      detail_en: result.detail_en || '',
    };
  }

  window.AdminTranslate = {
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    clearApiKey: clearApiKey,
    hasApiKey: hasApiKey,
    translate: translate,
    translateCalendar: translateCalendar,
  };
})();
