const fileInput = document.querySelector('#file-input');
const uploadCard = document.querySelector('.upload-card');
const statusEl = document.querySelector('#status');
const summaryEl = document.querySelector('#summary');
const recommendationsPanel = document.querySelector('#recommendations-panel');
const recommendationsEl = document.querySelector('#recommendations');
const columnsPanel = document.querySelector('#columns-panel');
const columnsBody = document.querySelector('#columns-body');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function detailForColumn(column) {
  if (column.numberSummary) {
    const { min, max, average, median } = column.numberSummary;
    return `最小 ${formatNumber(min)}，最大 ${formatNumber(max)}，平均 ${formatNumber(average)}，中位数 ${formatNumber(median)}`;
  }
  if (column.dateSummary) {
    return `时间范围：${column.dateSummary.earliest} 至 ${column.dateSummary.latest}`;
  }
  if (column.topValues.length > 0) {
    return column.topValues.map((item) => `${escapeHtml(item.value)} (${item.count})`).join('、');
  }
  return '暂无可展示详情';
}

function renderAnalysis(file, analysis) {
  statusEl.textContent = `已完成 ${file.name} 的自动分析。`;
  summaryEl.classList.remove('hidden');
  recommendationsPanel.classList.remove('hidden');
  columnsPanel.classList.remove('hidden');

  const summaryCards = [
    ['总行数', analysis.rowCount],
    ['字段数', analysis.columnCount],
    ['重复行', analysis.duplicateRows],
    ['质量分', `${analysis.qualityScore}/100`],
  ];
  summaryEl.innerHTML = summaryCards.map(([label, value]) => `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join('');

  recommendationsEl.innerHTML = analysis.recommendations
    .map((recommendation) => `<li>${escapeHtml(recommendation)}</li>`)
    .join('');

  columnsBody.innerHTML = analysis.columns.map((column) => `
    <tr>
      <td><strong>${escapeHtml(column.name)}</strong></td>
      <td><span class="badge">${escapeHtml(column.type)}</span></td>
      <td>${escapeHtml(column.missing)} (${escapeHtml(formatPercent(column.missingRate))})</td>
      <td>${escapeHtml(column.unique)}</td>
      <td class="detail">${detailForColumn(column)}</td>
    </tr>
  `).join('');
}

function showError(error) {
  statusEl.textContent = `分析失败：${error.message}`;
  summaryEl.classList.add('hidden');
  recommendationsPanel.classList.add('hidden');
  columnsPanel.classList.add('hidden');
}

function analyzeFile(file) {
  if (!file) return;
  statusEl.textContent = `正在读取 ${file.name} ...`;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const records = window.UserDataAnalyzer.parseFileContent(String(reader.result), file.name);
      const analysis = window.UserDataAnalyzer.analyzeRecords(records);
      renderAnalysis(file, analysis);
    } catch (error) {
      showError(error);
    }
  };
  reader.onerror = () => showError(new Error('无法读取文件，请重试。'));
  reader.readAsText(file);
}

fileInput.addEventListener('change', (event) => {
  analyzeFile(event.target.files[0]);
});

['dragenter', 'dragover'].forEach((eventName) => {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadCard.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadCard.classList.remove('drag-over');
  });
});

uploadCard.addEventListener('drop', (event) => {
  analyzeFile(event.dataTransfer.files[0]);
});
