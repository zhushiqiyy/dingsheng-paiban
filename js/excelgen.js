/* ============================================================
 * Excel 生成引擎（SheetJS）—— 班组值班表 / 节假日值班表
 * 尽量还原模板：列宽、行高、背景色(DDD9C4)、边框、宋体、横向打印
 * ============================================================ */
window.ExcelGen = (function () {

  function X() { return window.XLSX; }

  const SONG = '宋体';
  const HEADER_FILL = 'FFDDD9C4';   // 表头浅棕黄背景
  const YELLOW = 'FFFFFF00';        // 周末/节假日标黄

  function setStyle(ws, ref, o) {
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].s = {
      font: { name: o.font || SONG, sz: o.sz || 10, bold: !!o.bold },
      fill: o.fill ? { patternType: 'solid', fgColor: { rgb: o.fill } } : undefined,
      alignment: { horizontal: o.h || 'center', vertical: o.v || 'center', wrapText: o.wrap !== false },
      border: o.border,
    };
  }

  const B_MEDIUM = { top: { style: 'medium', color: { rgb: 'FF000000' } }, bottom: { style: 'medium', color: { rgb: 'FF000000' } }, left: { style: 'medium', color: { rgb: 'FF000000' } }, right: { style: 'medium', color: { rgb: 'FF000000' } } };
  const B_THIN = { top: { style: 'thin', color: { rgb: 'FF000000' } }, bottom: { style: 'thin', color: { rgb: 'FF000000' } }, left: { style: 'thin', color: { rgb: 'FF000000' } }, right: { style: 'thin', color: { rgb: 'FF000000' } } };

  function colLetter(i) { return X().utils.encode_col(i); }

  /**
   * 班组夜间值班表（多 sheet，匹配模板格式）
   * @param {array} deptList [{deptName, title, teams:[{name,phone,area}], cells:{date:{teamName:[...]}}, syncCols:[{label,cells}]}]
   * @param {object} info {year, month}
   */
  function buildBanzuWorkbook(deptList, syncUnits, info) {
    const wb = X().utils.book_new();
    const year = info.year, month = info.month;
    const days = Utils.daysInMonth(year, month);

    deptList.forEach(dept => {
      const teams = dept.teams || [];
      const cells = dept.cells || {};
      const syncCols = dept.syncCols || (syncUnits || []).filter(u => u.label);
      const totalCols = 1 + teams.length + syncCols.length;

      const ws = {};
      ws['!ref'] = X().utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4 + days, c: totalCols - 1 } });
      ws['!cols'] = [{ wch: 12 }].concat(teams.map(() => ({ wch: 18 }))).concat(syncCols.map(() => ({ wch: 16 })));
      ws['!rows'] = [
        { hpt: 32 }, { hpt: 25 }, { hpt: 23 }, { hpt: 50 }, { hpt: 30 },
      ].concat(Array.from({ length: days }, () => ({ hpt: 40 })));
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
      ];
      // 打印设置
      ws['!autofilter'] = undefined;

      // Row1 标题
      ws['A1'] = { t: 's', v: dept.title || `${dept.deptName}维保班组值班表（${month}月1日-${month}月${days}日）` };
      setStyle(ws, 'A1', { sz: 24, bold: true, h: 'left', v: 'center' });
      // Row2 火灾报警电话
      ws['A2'] = { t: 's', v: `火灾报警值班电话${CONFIG.COMPANY.fireAlarmPhone}` };
      setStyle(ws, 'A2', { sz: 11, h: 'left' });
      // Row3 表头
      ws['A3'] = { t: 's', v: '班组' };
      setStyle(ws, 'A3', { sz: 14, bold: true, fill: HEADER_FILL, border: B_MEDIUM });
      teams.forEach((t, i) => {
        const ref = colLetter(i + 1) + '3';
        ws[ref] = { t: 's', v: t.area || '' };
        setStyle(ws, ref, { sz: 14, bold: true, fill: HEADER_FILL, border: B_MEDIUM });
      });
      syncCols.forEach((u, i) => {
        const ref = colLetter(1 + teams.length + i) + '3';
        ws[ref] = { t: 's', v: u.label };
        setStyle(ws, ref, { sz: 14, bold: true, fill: HEADER_FILL, border: B_MEDIUM });
      });
      // Row4 班组名+电话
      ws['A4'] = { t: 's', v: '日期' };
      setStyle(ws, 'A4', { sz: 12, bold: true, fill: HEADER_FILL, border: B_MEDIUM });
      teams.forEach((t, i) => {
        const ref = colLetter(i + 1) + '4';
        ws[ref] = { t: 's', v: t.name + (t.phone ? '\n' + t.phone : '') };
        setStyle(ws, ref, { sz: 12, bold: true, fill: HEADER_FILL, border: B_MEDIUM });
      });
      syncCols.forEach((u, i) => {
        const ref = colLetter(1 + teams.length + i) + '4';
        ws[ref] = { t: 's', v: u.label };
        setStyle(ws, ref, { sz: 12, bold: true, fill: HEADER_FILL, border: B_MEDIUM });
      });
      // Row5 区域
      ws['A5'] = { t: 's', v: '' };
      setStyle(ws, 'A5', { sz: 10, border: B_MEDIUM });
      teams.forEach((t, i) => {
        const ref = colLetter(i + 1) + '5';
        ws[ref] = { t: 's', v: t.area || '' };
        setStyle(ws, ref, { sz: 10, border: B_MEDIUM });
      });
      syncCols.forEach((u, i) => {
        const ref = colLetter(1 + teams.length + i) + '5';
        ws[ref] = { t: 's', v: '' };
        setStyle(ws, ref, { sz: 10, border: B_MEDIUM });
      });

      // 日期行
      for (let d = 1; d <= days; d++) {
        const r = 4 + d - 1;
        const rn = r + 1;
        const isAD = Utils.isAllDay(year, month, d);
        // 日期列（Excel 日期序列号 + 日期格式）
        const dateSerial = Math.round((new Date(year, month - 1, d) - new Date(1899, 11, 30)) / 86400000);
        const dateRef = 'A' + rn;
        ws[dateRef] = { t: 'n', v: dateSerial, z: 'm"月"d"日"' };
        setStyle(ws, dateRef, { sz: 10, bold: true, fill: isAD ? YELLOW : undefined, border: B_THIN });
        teams.forEach((t, i) => {
          const ref = colLetter(i + 1) + rn;
          const raw = (cells[d] && cells[d][t.name]) || null;
          const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          const txt = list.map(p => p && p.name ? (Utils.phoneText(p) ? `${p.name} ${Utils.phoneText(p)}` : p.name) : '').filter(Boolean).join('\n');
          ws[ref] = { t: 's', v: txt };
          setStyle(ws, ref, { sz: 10, border: B_THIN });
        });
        syncCols.forEach((u, i) => {
          const ref = colLetter(1 + teams.length + i) + rn;
          const raw = (u.cells && u.cells[d]) || null;
          const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          const txt = list.map(p => p && p.name ? (Utils.phoneText(p) ? `${p.name} ${Utils.phoneText(p)}` : p.name) : '').filter(Boolean).join('\n');
          ws[ref] = { t: 's', v: txt };
          setStyle(ws, ref, { sz: 10, border: B_THIN });
        });
      }

      // 页面设置（横向 + 缩放）
      if (!ws['!print']) {
        ws['!print'] = {};
      }
      X().utils.book_append_sheet(wb, ws, dept.deptName);
    });

    return wb;
  }

  /**
   * 节假日值班表（多 sheet）
   */
  function buildHolidayWorkbook(s4) {
    const wb = X().utils.book_new();
    if (!s4) return wb;
    const dates = s4.dates || [];

    const sheetOrder = ['鼎盛公司'].concat(CONFIG.DEPARTMENTS.map(d => d.name));
    for (const sheetName of sheetOrder) {
      const sheet = (s4.sheets || {})[sheetName];
      if (!sheet) continue;
      const rows = sheet.rows || [];
      const aoa = [];
      aoa.push([`鼎盛公司 ${s4.holidayName || '节假日'}值班表（${sheetName}）`]);
      const headerRow = ['班组/区域'];
      dates.forEach(dt => { headerRow.push(`${dt.m}月${dt.d}日`); headerRow.push(''); });
      aoa.push(headerRow);
      const subRow = [''];
      dates.forEach(() => { subRow.push('白天'); subRow.push('晚上'); });
      aoa.push(subRow);
      for (const r of rows) {
        const line = [r.label];
        for (const dt of dates) {
          const key = `${dt.m}-${dt.d}`;
          const dd = (r.days && r.days[key]) || {};
          line.push(dd.day || ''); line.push(dd.night || '');
        }
        aoa.push(line);
      }
      const totalCols = 1 + dates.length * 2;
      const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];
      let c = 1;
      dates.forEach(() => { merges.push({ s: { r: 1, c: c }, e: { r: 1, c: c + 1 } }); c += 2; });
      const colWidths = [{ wch: 22 }].concat(dates.map(() => [{ wch: 14 }, { wch: 14 }]).flat());
      const ws = X().utils.aoa_to_sheet(aoa);
      ws['!merges'] = merges;
      ws['!cols'] = colWidths;
      X().utils.book_append_sheet(wb, ws, sheetName);
    }
    return wb;
  }

  function download(wb, filename) {
    X().writeFile(wb, filename, { cellStyles: true });
  }

  return { buildBanzuWorkbook, buildHolidayWorkbook, download };
})();
