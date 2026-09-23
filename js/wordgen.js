/* ============================================================
 * Word 生成引擎（docx.js）—— 一级/二级值班表
 * ============================================================ */
window.WordGen = (function () {

  const docx = window.docx;

  const SONG = '宋体';

  function run(text, opts) {
    opts = opts || {};
    return new docx.TextRun({
      text: String(text),
      bold: !!opts.bold,
      size: opts.size || 24,        // half-points（默认12pt）
      font: opts.font || SONG,
      color: opts.color || '000000',
    });
  }

  function para(text, opts) {
    opts = opts || {};
    const children = Array.isArray(text) ? text : [run(text, opts)];
    return new docx.Paragraph({
      children,
      alignment: opts.align != null ? opts.align : docx.AlignmentType.CENTER,
      spacing: { before: opts.before || 0, after: opts.after || 0, line: opts.line || 276 },
    });
  }

  // 表格单元格
  function cell(children, opts) {
    opts = opts || {};
    return new docx.TableCell({
      children: Array.isArray(children) ? children : [children],
      columnSpan: opts.span,
      rowSpan: opts.rowSpan,
      shading: opts.fill ? { type: docx.ShadingType.CLEAR, fill: opts.fill } : undefined,
      verticalAlign: opts.valign != null ? opts.valign : docx.VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });
  }

  function borders(style, color, size) {
    const s = { style, color: color || '000000', size: size || 4, space: 0 };
    return { top: s, bottom: s, left: s, right: s, insideHorizontal: s, insideVertical: s };
  }

  const BORDER = borders(docx.BorderStyle.SINGLE, '000000', 4);

  /** 生成日期格文本，如 01全天 */
  function dateCellText(day, tag) {
    return Utils.pad2(day) + (tag || '晚');
  }

  /** 生成人员格文本 */
  function personCellText(p) {
    if (!p || !p.name) return '';
    const phone = Utils.phoneText(p);
    return phone ? `${p.name}\n${phone}` : p.name;
  }

  /** 人员格段落（姓名一行 + 电话一行） */
  function personCellParas(p) {
    if (!p || !p.name) return [para('', { size: 20 })];
    const phone = Utils.phoneText(p);
    const paras = [para(p.name, { size: 20 })];
    if (phone) paras.push(para(phone, { size: 18 }));
    return paras;
  }

  /**
   * 构建一级/二级共用的值班表网格
   * @param {object} data { year, month, assignments, tags, note }
   * @param {object} opts { colWidths, titleSuffix, headers }
   */
  function buildGridTable(data, opts) {
    opts = opts || {};
    const year = data.year, month = data.month;
    const days = Utils.daysInMonth(year, month);
    const assign = data.assignments || {};
    const tags = data.tags || {};

    const titleText = `${Utils.yearCN(year)}年${Utils.monthCN(month)}${opts.titleSuffix || '值班表'}`;
    const colWidths = opts.colWidths || [1505, 3334, 1425, 3149];
    const spanAll = colWidths.length;

    const rows = [];

    // 公司名
    rows.push(new docx.TableRow({
      children: [cell(para(CONFIG.COMPANY.fullName, { bold: true, size: 32 }), { span: spanAll })],
    }));
    // 标题
    rows.push(new docx.TableRow({
      children: [cell(para(titleText, { bold: true, size: 32 }), { span: spanAll })],
    }));
    // 表头
    const headerCells = (opts.headers || ['日期', '值班人及其手机号', '日期', '值班人及其手机号'])
      .map(h => cell(para(h, { bold: true, size: 22 })));
    rows.push(new docx.TableRow({ children: headerCells, tableHeader: true }));

    // 日期行：左右两列（每行放两天）
    const rowCount = Math.ceil(days / 2);
    for (let i = 0; i < rowCount; i++) {
      const leftDay = i + 1;
      const rightDay = leftDay + rowCount;
      const cells = [];
      const lt = tags[leftDay] || Utils.dayTag(year, month, leftDay);
      cells.push(cell(para(dateCellText(leftDay, lt), { bold: true, size: 22 }), { fill: lt === '全天' ? 'FFF200' : undefined }));
      cells.push(cell(personCellParas(assign[leftDay])));
      if (rightDay <= days) {
        const rt = tags[rightDay] || Utils.dayTag(year, month, rightDay);
        cells.push(cell(para(dateCellText(rightDay, rt), { bold: true, size: 22 }), { fill: rt === '全天' ? 'FFF200' : undefined }));
        cells.push(cell(personCellParas(assign[rightDay])));
      } else {
        cells.push(cell(para('', { size: 20 })));
        cells.push(cell(para('', { size: 20 })));
      }
      rows.push(new docx.TableRow({ children: cells }));
    }

    // 说明/备注
    const note = data.note || '';
    rows.push(new docx.TableRow({
      children: [cell(para(note, { size: 18, align: docx.AlignmentType.LEFT, line: 240 }), { span: spanAll, valign: docx.VerticalAlign.TOP })],
    }));

    // 底部签字行（制表/审核/批准 等，放表格内与模板一致）
    if (opts.footerText) {
      rows.push(new docx.TableRow({
        children: [cell(para(opts.footerText, { size: 21, align: docx.AlignmentType.LEFT }), { span: spanAll })],
      }));
    }

    return new docx.Table({
      rows,
      width: { size: colWidths.reduce((a, b) => a + b, 0), type: docx.WidthType.DXA },
      columnWidths: colWidths,
      borders: BORDER,
    });
  }

  /** 一级值班表（干部值班表） */
  function buildLevel1(data) {
    data = data || {};
    const year = data.year, month = data.month;
    return new docx.Document({
      creator: '鼎盛公司排班系统',
      title: `${CONFIG.COMPANY.shortName}${year}年${month}月份干部值班表`,
      sections: [{
        properties: {
          page: {
            size: { width: 7560310 / 914400 * 1440, height: 10692130 / 914400 * 1440 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          para(`${CONFIG.COMPANY.shortName}${year}年${month}月份干部值班表`, { bold: true, size: 36, after: 60 }),
          para('', { after: 60 }),
          para(`发布部门:   ${data.publishDept || ''}         发布人:   ${data.publisher || ''}        发布时间:   ${data.publishDate || ''}`, { align: docx.AlignmentType.LEFT, size: 22, after: 80 }),
          buildGridTable({ year, month, assignments: data.assignments, tags: data.tags, note: data.note }, {
            colWidths: [1505, 3334, 1425, 3149],
            titleSuffix: '干部值班表',
            headers: ['日期', '值班人及其手机号', '日期', '值班人及其手机号'],
            footerText: `制表：${data.maker || ''}            审核：${data.reviewer || ''}            批准：${data.approver || ''}`,
          }),
        ],
      }],
    });
  }

  /** 二级值班表（多部门合并） */
  function buildLevel2(items) {
    const children = [];
    items.forEach((item) => {
      const dept = item.dept;
      const data = item.data || {};
      const year = data.year, month = data.month;
      children.push(para(`${CONFIG.COMPANY.fullName}${year}年${month}月份${dept.name}二级值班表`, { bold: true, size: 33, after: 40 }));
      children.push(para('', { after: 40 }));
      children.push(para(`发布部门 :  ${dept.name}      发布人 : ${data.publisher || dept.publisher || ''}    发布时间 : ${data.publishDate || ''}`, { align: docx.AlignmentType.LEFT, size: 22, after: 60 }));
      children.push(buildGridTable({ year, month, assignments: data.assignments, tags: data.tags, note: data.note || dept.note }, {
        colWidths: [1297, 3721, 1352, 3443],
        titleSuffix: '值班表',
        headers: ['日期', '值班人', '日期', '值班人'],
        footerText: `审批：　${data.approver || dept.approver || ''}　           　制表： ${data.maker || dept.maker || ''}           　制表日期： ${data.publishDate || ''}`,
      }));
      children.push(para('', { after: 120 }));
    });

    const first = items[0];
    const y = first && first.data ? first.data.year : new Date().getFullYear();
    const m = first && first.data ? first.data.month : new Date().getMonth() + 1;
    return new docx.Document({
      creator: '鼎盛公司排班系统',
      title: `${CONFIG.COMPANY.fullName}${y}年${m}月份二级值班表`,
      sections: [{
        properties: {
          page: {
            size: { width: 7560310 / 914400 * 1440, height: 10692130 / 914400 * 1440 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      }],
    });
  }

  /** 打包并下载 */
  async function download(doc, filename) {
    const blob = await docx.Packer.toBlob(doc);
    Utils.downloadBlob(blob, filename);
  }

  return { buildLevel1, buildLevel2, download };
})();
