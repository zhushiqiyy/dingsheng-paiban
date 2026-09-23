/* ============================================================
 * 工具函数：日期、中文数字、拼音匹配、格式化
 * ============================================================ */
window.Utils = (function () {

  const CN_DIGITS = ['○', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const CN_MONTHS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

  /** 阿拉伯数字年份 -> 中文（2026 -> 二○二六） */
  function yearCN(y) {
    return String(y).split('').map(d => CN_DIGITS[+d] || d).join('');
  }
  /** 月份 -> 中文（10 -> 十月份） */
  function monthCN(m) {
    return CN_MONTHS[m] + '月份';
  }
  /** 数字 -> 中文（1 -> 一，10 -> 十，31 -> 三十一） */
  function numCN(n) {
    if (n <= 10) return CN_MONTHS[n] || CN_DIGITS[n];
    if (n < 20) return '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
    if (n < 100) {
      const t = Math.floor(n / 10), o = n % 10;
      return CN_DIGITS[t] + '十' + (o ? CN_DIGITS[o] : '');
    }
    return String(n);
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** 某月天数 */
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate(); // month: 1-12
  }

  /** 判断日期是否为周末 */
  function isWeekend(year, month, day) {
    const d = new Date(year, month - 1, day).getDay();
    return d === 0 || d === 6;
  }

  /** 判断日期是否在法定节假日（放假）内 */
  function isHoliday(year, month, day) {
    const h = CONFIG.HOLIDAYS[year];
    if (!h) return false;
    return h.holidays.some(r => {
      const s = r.start, e = r.end;
      const startVal = s[0] * 100 + s[1], endVal = e[0] * 100 + e[1], curVal = month * 100 + day;
      return curVal >= startVal && curVal <= endVal;
    });
  }

  /** 判断日期是否为调休上班日（周末但上班） */
  function isMakeupWorkday(year, month, day) {
    const h = CONFIG.HOLIDAYS[year];
    if (!h) return false;
    return h.makeupWorkdays.some(d => d[0] === month && d[1] === day);
  }

  /** 是否为“全天”（周末或法定节假日），否则“晚” */
  function isAllDay(year, month, day) {
    return isWeekend(year, month, day) || isHoliday(year, month, day);
  }

  /** 返回某天的类型标签：全天 / 晚 */
  function dayTag(year, month, day) {
    return isAllDay(year, month, day) ? '全天' : '晚';
  }

  /** 获取某月所有法定节假日名称（用于显示） */
  function holidayNames(year, month, day) {
    const h = CONFIG.HOLIDAYS[year];
    if (!h) return [];
    return h.holidays.filter(r => {
      const s = r.start, e = r.end;
      const sv = s[0] * 100 + s[1], ev = e[0] * 100 + e[1], cv = month * 100 + day;
      return cv >= sv && cv <= ev;
    }).map(r => r.name);
  }

  /** 日期 -> 短格式 YYYY-M-D */
  function fmtDate(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  /** 日期 -> 中文发布用，如 2026年9月25日 */
  function fmtDateCN(year, month, day) {
    return `${year}年${month}月${day}日`;
  }

  /* ---------- 拼音匹配 ---------- */
  function _py(name) {
    try {
      if (window.pinyinPro) {
        return window.pinyinPro.pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
      }
    } catch (e) { /* ignore */ }
    return name.toLowerCase();
  }
  function _pyInitial(name) {
    try {
      if (window.pinyinPro) {
        return window.pinyinPro.pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  /** 模糊匹配：姓名/拼音/拼音首字母/电话(长号或短号) 任一包含 query */
  function matchPerson(query, person) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const name = (person.name || '').toLowerCase();
    const phone = ((person.phone || '') + ' ' + (person.shortPhone || '')).toLowerCase();
    if (name.includes(q)) return true;
    if (phone.includes(q)) return true;
    if (name.includes(q.replace(/\s+/g, ''))) return true;
    const py = _py(person.name || '');
    if (py.includes(q)) return true;
    const ini = _pyInitial(person.name || '');
    if (ini && ini.includes(q)) return true;
    return false;
  }

  /* ---------- 随机/ID ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** 人员电话号码显示：长号/短号（如 15805805019/615019） */
  function phoneText(person) {
    if (!person) return '';
    const long = (person.phone || '').trim();
    const short = (person.shortPhone || '').trim();
    if (long && short) return `${long}/${short}`;
    return long || short;
  }

  /** 人员完整显示文本：姓名 + 电话（如 牛涛 13758031896/632896） */
  function personText(person) {
    if (!person) return '';
    const p = phoneText(person);
    return p ? `${person.name} ${p}` : (person.name || '');
  }

  /* ---------- 简单密码散列（前端演示用，非安全哈希） ---------- */
  function hashPassword(pw) {
    let h = 5381;
    const s = String(pw) + '__dingsheng_salt__';
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return 'h' + (h >>> 0).toString(16);
  }

  /* ---------- 下载 Blob ---------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  /* ---------- 文件读取 ---------- */
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  return {
    yearCN, monthCN, numCN, pad2, daysInMonth,
    isWeekend, isHoliday, isMakeupWorkday, isAllDay, dayTag, holidayNames,
    fmtDate, fmtDateCN, matchPerson, uid, hashPassword, downloadBlob, readFileAsArrayBuffer,
    phoneText, personText,
  };
})();
