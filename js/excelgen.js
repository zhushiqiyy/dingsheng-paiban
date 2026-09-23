/* ============================================================
 * Excel 生成引擎（SheetJS）—— 班组值班表 / 节假日值班表
 * ============================================================ */
window.ExcelGen = (function () {

  function X() { return window.XLSX; }

  function aoaToSheet(aoa, merges, colWidths) {
    const ws = X().utils.aoa_to_sheet(aoa);
    if (merges) ws['!merges'] = merges;
    if (colWidths) ws['!cols'] = colWidths;
    return ws;
  }

  // 样式颜色（SheetJS 社区版不支持富样式，通过单元格类型 + 后续可选处理；
  // 这里用黄色填充标记全天，用 s 字段实现）
  function cellWithFill(v, fill) {
    return { t: 's', v: String(v == null ? '' : v), s: fill ? { fill: { fgColor: { rgb: 'FFFFF200' } } } : undefined };
  }

  /**
   * 班组夜间值班表（多 sheet）
   * @param {array} deptList [{deptName, teams:[{name,phone,area}], cells:{date:{teamName:{name,phone}}}}]
   * @param {object} info {year, month}
   */
  function buildBanzuWorkbook(deptList, info) {
    const wb = X().utils.book_new();
    const year = info.year, month = info.month;
    const days = Utils.daysInMonth(year, month);

    deptList.forEach(dept => {
      const teams = dept.teams || [];
      const cells = dept.cells || {};
      const n = teams.length;
      const totalCols = n + 1; // A列日期 + n个班组

      const aoa = [];
      // Row1 标题
      aoa.push([`${dept.deptName}维保班组值班表（${month}月1日-${month}月${days}日）`]);
      // Row2 火灾报警电话
      aoa.push([`火灾报警值班电话${CONFIG.COMPANY.fireAlarmPhone}`]);
      // Row3 表头：日期 + 班组名
      const header = ['日期'];
      teams.forEach(t => header.push(t.name + (t.phone ? '\n' + t.phone : '')));
      aoa.push(header);
      // Row4 区域
      const areaRow = ['区域'];
      teams.forEach(t => areaRow.push(t.area || ''));
      aoa.push(areaRow);
      // 日期行
      for (let d = 1; d <= days; d++) {
        const row = [`${month}月${d}日`];
        const isAD = Utils.isAllDay(year, month, d);
        for (const t of teams) {
          const p = (cells[d] && cells[d][t.name]) || null;
          const txt = p && p.name ? (p.phone ? `${p.name}\n${p.phone}` : p.name) : '';
          row.push(txt);
        }
        aoa.push(row);
      }

      const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
      ];
      const colWidths = [{ wch: 12 }].concat(teams.map(() => ({ wch: 18 })));
      const ws = aoaToSheet(aoa, merges, colWidths);

      // 黄色填充全天日期（日期列）
      for (let d = 1; d <= days; d++) {
        const rowIdx = 4 + (d - 1);
        const cellRef = X().utils.encode_cell({ r: rowIdx, c: 0 });
        if (Utils.isAllDay(year, month, d)) {
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: `${month}月${d}日` };
          ws[cellRef].s = { fill: { fgColor: { rgb: 'FFFFFF00' } } };
        }
      }

      X().utils.book_append_sheet(wb, ws, dept.deptName);
    });

    return wb;
  }

  /**
   * 节假日值班表（多 sheet：鼎盛公司 + 各部门）
   * @param {object} s4 { year, holidayName, dates:[{y,m,d}], sheets: { '鼎盛公司': {rows:[{label, day:{d:name}, night:{d:name}}]}, deptName: {...} } }
   */
  function buildHolidayWorkbook(s4) {
    const wb = X().utils.book_new();
    if (!s4) return wb;
    const dates = s4.dates || [];
    const dayCols = []; // 每个日期占2列（白天/晚上）
    dates.forEach(dt => dayCols.push(dt.d));

    const sheetOrder = ['鼎盛公司'].concat(CONFIG.DEPARTMENTS.map(d => d.name));
    for (const sheetName of sheetOrder) {
      const sheet = (s4.sheets || {})[sheetName];
      if (!sheet) continue;
      const rows = sheet.rows || [];
      // 标题
      const aoa = [];
      aoa.push([`鼎盛公司 ${s4.holidayName || '节假日'}值班表（${sheetName}）`]);
      // 表头：区域/班组 + 日期(白天/晚上)
      const headerRow = ['班组/区域'];
      dates.forEach(dt => {
        headerRow.push(`${dt.m}月${dt.d}日`);
        headerRow.push('');
      });
      aoa.push(headerRow);
      const subRow = [''];
      dates.forEach(() => { subRow.push('白天'); subRow.push('晚上'); });
      aoa.push(subRow);

      for (const r of rows) {
        const line = [r.label];
        for (const dt of dates) {
          const key = `${dt.m}-${dt.d}`;
          const dd = (r.days && r.days[key]) || {};
          line.push(dd.day || '');
          line.push(dd.night || '');
        }
        aoa.push(line);
      }

      const totalCols = 1 + dates.length * 2;
      const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];
      // 每个日期的两列合并为日期头
      let c = 1;
      dates.forEach(() => {
        merges.push({ s: { r: 1, c: c }, e: { r: 1, c: c + 1 } });
        c += 2;
      });
      const colWidths = [{ wch: 22 }].concat(dates.map(() => [{ wch: 14 }, { wch: 14 }]).flat());
      const ws = aoaToSheet(aoa, merges, colWidths);
      X().utils.book_append_sheet(wb, ws, sheetName);
    }
    return wb;
  }

  /** 下载 */
  function download(wb, filename) {
    X().writeFile(wb, filename);
  }

  return { buildBanzuWorkbook, buildHolidayWorkbook, download };
})();
