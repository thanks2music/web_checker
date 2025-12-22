import * as jsdiff from 'diff';

export type DiffMode = 'chars' | 'words' | 'lines';

/**
 * Slack 用のテキスト差分を生成する
 * @param newStr 新しい文字列
 * @param oldStr 古い文字列（省略可、undefinedまたはnullの場合は空文字として扱う）
 * @param mode 差分モード（'chars', 'words', 'lines'）デフォルトは 'lines'
 * @returns Slack 用にフォーマットされた差分文字列
 */
const slackDiff = (newStr: string | null, oldStr?: string | null, mode?: DiffMode): string => {
  if (typeof newStr === 'undefined') {
    throw new Error('invalid newStr');
  }

  const normalizedNewStr = newStr === null ? '' : newStr;
  const normalizedOldStr = (typeof oldStr === 'undefined' || oldStr === null) ? '' : oldStr;

  let diffs: jsdiff.Change[];
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

export default slackDiff;
