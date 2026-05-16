const assert = require('node:assert/strict');
const { analyzeRecords, parseCsv, parseJson } = require('../src/analyzer');

const csv = `name,email,age,created_at,city
Alice,alice@example.com,28,2025-01-10,Shanghai
Bob,bob@example.com,31,2025-02-01,Beijing
Bob,bob@example.com,31,2025-02-01,Beijing
Carol,,22,2025-03-05,Shanghai
`;

const records = parseCsv(csv);
assert.equal(records.length, 4);
assert.deepEqual(records[0], {
  name: 'Alice',
  email: 'alice@example.com',
  age: '28',
  created_at: '2025-01-10',
  city: 'Shanghai',
});

const analysis = analyzeRecords(records);
assert.equal(analysis.rowCount, 4);
assert.equal(analysis.columnCount, 5);
assert.equal(analysis.duplicateRows, 1);
assert.equal(analysis.columns.find((column) => column.name === 'email').type, 'email');
assert.equal(analysis.columns.find((column) => column.name === 'age').numberSummary.max, 31);
assert.equal(analysis.columns.find((column) => column.name === 'created_at').dateSummary.earliest, '2025-01-10');
assert.ok(analysis.sensitiveColumns.includes('email'));
assert.ok(analysis.recommendations.some((item) => item.includes('重复数据')));

const jsonRecords = parseJson('{"users":[{"id":1,"phone":"+1 555 123 4567"}]}');
assert.equal(jsonRecords.length, 1);
assert.equal(analyzeRecords(jsonRecords).columns.find((column) => column.name === 'phone').type, 'phone');
