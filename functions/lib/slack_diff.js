const jsdiff = require('diff');

const slackDiff = (newStr, oldStr, mode) => {
  if (typeof newStr === 'undefined') {
    throw new Error('invalid newStr');
  }

  const normalizedNewStr = newStr === null ? '' : newStr;
  const normalizedOldStr = (typeof oldStr === 'undefined' || oldStr === null) ? '' : oldStr;

  let diffs;
  switch (mode) {
    case 'chars':
      diffs = jsdiff.diffChars(normalizedOldStr, normalizedNewStr);
      break;
    case 'words':
      diffs = jsdiff.diffWords(normalizedOldStr, normalizedNewStr);
      break;
    case 'lines':
    default:
      diffs = jsdiff.diffLines(normalizedOldStr, normalizedNewStr);
      break;
  }

  let diffStr = '';
  diffs.forEach((d) => {
    if (!d.value.match(/^\n+$/)) {
      if (d.added) {
        diffStr += `+ ${d.value.trim().replace(/\n/g, '\n  ')}\n`;
      } else if (d.removed) {
        diffStr += `- ~${d.value.trim().replace(/\s*\n/g, '~\n  ~')}~\n`;
      }
    }
  });

  return diffStr;
};

module.exports = slackDiff;
