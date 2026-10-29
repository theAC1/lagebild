import { configDefaults, defineConfig } from 'vitest/config';

// Arbeitskopien von Agenten (.claude/worktrees) nicht mittesten.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
