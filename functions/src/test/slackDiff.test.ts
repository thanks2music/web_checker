import slackDiff from '../lib/slackDiff';

describe('slackDiff', () => {
  test('basic diff operations', () => {
    expect(slackDiff('new text', 'old text')).toBe('- ~old text~\n+ new text\n');
    expect(slackDiff('new text')).toBe('+ new text\n');
    expect(slackDiff('new text', null)).toBe('+ new text\n');
    expect(slackDiff(null, 'old text')).toBe('- ~old text~\n');
  });

  test('multiline diff operations', () => {
    expect(slackDiff('new text\nsecond line', 'old text\nsecond line')).toBe('- ~old text~\n+ new text\n');
    expect(slackDiff('new text\nnew second line', 'old text\nold second line')).toBe('- ~old text~\n  ~old second line~\n+ new text\n  new second line\n');
    expect(slackDiff('new text\nnew second line', 'old text \nold second line')).toBe('- ~old text~\n  ~old second line~\n+ new text\n  new second line\n');
  });
});

describe('slackDiff error handling', () => {
  test('throws error without newStr', () => {
    // @ts-expect-error: Testing invalid input
    const withoutArgs = (): string => slackDiff();
    expect(withoutArgs).toThrowError('invalid newStr');
  });
});
