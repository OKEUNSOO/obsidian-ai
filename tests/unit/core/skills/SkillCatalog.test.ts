import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  buildCodexSkillInstructions,
  getClaudeSkillPath,
  getSharedSkillPath,
  loadSkillCatalog,
  mirrorSkillToClaude,
  removeSkillFromBothStores,
} from '@/core/skills/SkillCatalog';

describe('SkillCatalog', () => {
  let vaultPath: string;

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-ai-skills-'));
  });

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  });

  it('migrates legacy .claude skills into shared .agents skills', () => {
    const legacySkillPath = getClaudeSkillPath(vaultPath, 'proofread');
    fs.mkdirSync(legacySkillPath, { recursive: true });
    fs.writeFileSync(
      path.join(legacySkillPath, 'SKILL.md'),
      '---\nname: proofread\ndescription: 문장 교정\n---\n\n# Proofread\n',
      'utf-8',
    );

    const skills = loadSkillCatalog(vaultPath);

    expect(skills).toEqual([
      expect.objectContaining({
        name: 'proofread',
        description: '문장 교정',
      }),
    ]);
    expect(fs.existsSync(path.join(getSharedSkillPath(vaultPath, 'proofread'), 'SKILL.md'))).toBe(true);
  });

  it('mirrors shared skills back to .claude for Claude compatibility', () => {
    const sharedSkillPath = getSharedSkillPath(vaultPath, 'obsidian-markdown');
    fs.mkdirSync(sharedSkillPath, { recursive: true });
    fs.writeFileSync(
      path.join(sharedSkillPath, 'SKILL.md'),
      '---\nname: obsidian-markdown\ndescription: Obsidian markdown\n---\n',
      'utf-8',
    );

    mirrorSkillToClaude(vaultPath, 'obsidian-markdown');

    expect(fs.readFileSync(path.join(getClaudeSkillPath(vaultPath, 'obsidian-markdown'), 'SKILL.md'), 'utf-8'))
      .toContain('Obsidian markdown');
  });

  it('builds Codex prompt instructions with shared skill paths', () => {
    const sharedSkillPath = getSharedSkillPath(vaultPath, 'tailor-resume');
    fs.mkdirSync(sharedSkillPath, { recursive: true });
    fs.writeFileSync(
      path.join(sharedSkillPath, 'SKILL.md'),
      '---\nname: tailor-resume\ndescription: JD 기반 이력서 맞춤화\n---\n',
      'utf-8',
    );

    const prompt = buildCodexSkillInstructions(vaultPath);

    expect(prompt).toContain('Project skills are stored in `.agents/skills`');
    expect(prompt).toContain('- tailor-resume: JD 기반 이력서 맞춤화 (read .agents/skills/tailor-resume/SKILL.md)');
  });

  it('removes a skill from shared and Claude-compatible stores', () => {
    for (const skillPath of [
      getSharedSkillPath(vaultPath, 'review-resume'),
      getClaudeSkillPath(vaultPath, 'review-resume'),
    ]) {
      fs.mkdirSync(skillPath, { recursive: true });
      fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '---\nname: review-resume\n---\n', 'utf-8');
    }

    removeSkillFromBothStores(vaultPath, 'review-resume');

    expect(fs.existsSync(getSharedSkillPath(vaultPath, 'review-resume'))).toBe(false);
    expect(fs.existsSync(getClaudeSkillPath(vaultPath, 'review-resume'))).toBe(false);
  });
});
