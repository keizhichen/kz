(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UserDataAnalyzer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_PATTERN = /^\+?[\d\s().-]{7,}$/;

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(value.trim());
        value = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          index += 1;
        }
        row.push(value.trim());
        if (row.some((cell) => cell !== '')) {
          rows.push(row);
        }
        row = [];
        value = '';
      } else {
        value += char;
      }
    }

    row.push(value.trim());
    if (row.some((cell) => cell !== '')) {
      rows.push(row);
    }

    if (rows.length === 0) {
      return [];
    }

    const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
    return rows.slice(1).map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] || '';
      });
      return record;
    });
  }

  function parseJson(text) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeRecord);
    }
    if (parsed && Array.isArray(parsed.users)) {
      return parsed.users.map(normalizeRecord);
    }
    if (parsed && Array.isArray(parsed.data)) {
      return parsed.data.map(normalizeRecord);
    }
    if (parsed && typeof parsed === 'object') {
      return [normalizeRecord(parsed)];
    }
    return [];
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { value: record };
    }
    return record;
  }

  function parseFileContent(text, fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    if (extension === 'json') {
      return parseJson(text);
    }
    return parseCsv(text);
  }

  function isEmpty(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function asNumber(value) {
    if (isEmpty(value)) {
      return null;
    }
    const cleaned = String(value).replace(/[$,%]/g, '').trim();
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function asDate(value) {
    if (isEmpty(value)) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function inferType(values) {
    const present = values.filter((value) => !isEmpty(value));
    if (present.length === 0) {
      return 'empty';
    }

    const numericCount = present.filter((value) => asNumber(value) !== null).length;
    const dateCount = present.filter((value) => asDate(value) !== null && asNumber(value) === null).length;
    const emailCount = present.filter((value) => EMAIL_PATTERN.test(String(value).trim())).length;
    const phoneCount = present.filter((value) => PHONE_PATTERN.test(String(value).trim())).length;

    if (emailCount / present.length >= 0.7) return 'email';
    if (numericCount / present.length >= 0.8) return 'number';
    if (dateCount / present.length >= 0.8) return 'date';
    if (phoneCount / present.length >= 0.7) return 'phone';
    return 'text';
  }

  function summarizeNumber(values) {
    const numbers = values.map(asNumber).filter((value) => value !== null).sort((a, b) => a - b);
    if (numbers.length === 0) return null;
    const sum = numbers.reduce((total, value) => total + value, 0);
    const midpoint = Math.floor(numbers.length / 2);
    const median = numbers.length % 2 === 0
      ? (numbers[midpoint - 1] + numbers[midpoint]) / 2
      : numbers[midpoint];
    return {
      min: numbers[0],
      max: numbers[numbers.length - 1],
      average: sum / numbers.length,
      median,
    };
  }

  function summarizeDate(values) {
    const dates = values.map(asDate).filter(Boolean).sort((a, b) => a - b);
    if (dates.length === 0) return null;
    return {
      earliest: dates[0].toISOString().slice(0, 10),
      latest: dates[dates.length - 1].toISOString().slice(0, 10),
    };
  }

  function topValues(values) {
    const counts = new Map();
    values.filter((value) => !isEmpty(value)).forEach((value) => {
      const label = String(value).trim();
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 5);
  }

  function analyzeRecords(records) {
    const normalizedRecords = records.map(normalizeRecord);
    const columns = Array.from(new Set(normalizedRecords.flatMap((record) => Object.keys(record))));
    const duplicateRows = normalizedRecords.length - new Set(normalizedRecords.map((record) => JSON.stringify(record))).size;

    const columnSummaries = columns.map((name) => {
      const values = normalizedRecords.map((record) => record[name]);
      const missing = values.filter(isEmpty).length;
      const type = inferType(values);
      return {
        name,
        type,
        missing,
        missingRate: normalizedRecords.length ? missing / normalizedRecords.length : 0,
        unique: new Set(values.filter((value) => !isEmpty(value)).map((value) => String(value).trim())).size,
        numberSummary: type === 'number' ? summarizeNumber(values) : null,
        dateSummary: type === 'date' ? summarizeDate(values) : null,
        topValues: type === 'text' || type === 'email' || type === 'phone' ? topValues(values) : [],
      };
    });

    const sensitiveColumns = columnSummaries
      .filter((column) => column.type === 'email' || column.type === 'phone' || /name|email|phone|mobile|address|id/i.test(column.name))
      .map((column) => column.name);

    return {
      rowCount: normalizedRecords.length,
      columnCount: columns.length,
      duplicateRows,
      columns: columnSummaries,
      qualityScore: calculateQualityScore(normalizedRecords.length, columns.length, duplicateRows, columnSummaries),
      sensitiveColumns,
      recommendations: buildRecommendations(normalizedRecords.length, duplicateRows, columnSummaries, sensitiveColumns),
    };
  }

  function calculateQualityScore(rowCount, columnCount, duplicateRows, columns) {
    if (rowCount === 0 || columnCount === 0) return 0;
    const totalCells = rowCount * columnCount;
    const missingCells = columns.reduce((total, column) => total + column.missing, 0);
    const missingPenalty = missingCells / totalCells;
    const duplicatePenalty = duplicateRows / rowCount;
    return Math.max(0, Math.round((1 - missingPenalty * 0.7 - duplicatePenalty * 0.3) * 100));
  }

  function buildRecommendations(rowCount, duplicateRows, columns, sensitiveColumns) {
    const recommendations = [];
    if (rowCount === 0) {
      recommendations.push('文件里没有可分析的数据，请确认表头和内容是否正确。');
      return recommendations;
    }
    if (duplicateRows > 0) {
      recommendations.push(`发现 ${duplicateRows} 行重复数据，建议导入前先去重。`);
    }
    columns.filter((column) => column.missingRate >= 0.2).forEach((column) => {
      recommendations.push(`${column.name} 缺失率达到 ${Math.round(column.missingRate * 100)}%，建议补齐或评估是否保留。`);
    });
    if (sensitiveColumns.length > 0) {
      recommendations.push(`检测到可能的敏感字段：${sensitiveColumns.join('、')}，建议限制访问并脱敏展示。`);
    }
    if (recommendations.length === 0) {
      recommendations.push('数据质量看起来不错，可以继续做分群、留存或转化分析。');
    }
    return recommendations;
  }

  return {
    analyzeRecords,
    parseCsv,
    parseFileContent,
    parseJson,
  };
});
