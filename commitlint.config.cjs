/**
 * Commitlint config — Conventional Commits
 * https://www.conventionalcommits.org
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'ci', 'perf', 'build', 'style', 'revert'],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'sentence-case', 'start-case']],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 72],
    'subject-full-stop': [2, 'never', '.'],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'header-max-length': [2, 'always', 100],
    'scope-enum': [
      2,
      'always',
      [
        'shared',
        'core',
        'score',
        'sources',
        'authority',
        'attest',
        'web',
        'contracts',
        'docs',
        'ci',
        'repo',
        'deps',
      ],
    ],
  },
};
