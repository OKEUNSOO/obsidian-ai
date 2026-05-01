import * as fs from 'fs';
import * as path from 'path';

export const SHARED_SKILLS_RELATIVE_PATH = path.join('.agents', 'skills');
export const CLAUDE_SKILLS_RELATIVE_PATH = path.join('.claude', 'skills');

export interface SkillCatalogEntry {
  name: string;
  description: string;
  path: string;
}

export function getSharedSkillsPath(vaultPath: string): string {
  return path.join(vaultPath, SHARED_SKILLS_RELATIVE_PATH);
}

export function getClaudeSkillsPath(vaultPath: string): string {
  return path.join(vaultPath, CLAUDE_SKILLS_RELATIVE_PATH);
}

export function getSharedSkillPath(vaultPath: string, skillName: string): string {
  return path.join(getSharedSkillsPath(vaultPath), skillName);
}

export function getClaudeSkillPath(vaultPath: string, skillName: string): string {
  return path.join(getClaudeSkillsPath(vaultPath), skillName);
}

export function readSkillDescription(content: string): string {
  const descMatch = content.match(/^---\s*[\s\S]*?description:\s*([^\r\n]+)/);
  return descMatch?.[1]?.trim() || '';
}

export function loadSkillCatalog(vaultPath: string): SkillCatalogEntry[] {
  ensureSharedSkillsMigrated(vaultPath);
  mirrorSharedSkillsToClaude(vaultPath);

  const skillsBasePath = getSharedSkillsPath(vaultPath);
  if (!fs.existsSync(skillsBasePath)) return [];

  const skills: SkillCatalogEntry[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsBasePath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(skillsBasePath, entry.name);
    const skillFilePath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFilePath)) continue;

    let description = '';
    try {
      description = readSkillDescription(fs.readFileSync(skillFilePath, 'utf-8'));
    } catch {
      // Keep listing the skill even if its description cannot be read.
    }

    skills.push({
      name: entry.name,
      description: description || 'No description available',
      path: skillDir,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function ensureSharedSkillsMigrated(vaultPath: string): void {
  const legacyPath = getClaudeSkillsPath(vaultPath);
  const sharedPath = getSharedSkillsPath(vaultPath);
  if (!fs.existsSync(legacyPath)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(legacyPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const legacySkillPath = path.join(legacyPath, entry.name);
    if (!fs.existsSync(path.join(legacySkillPath, 'SKILL.md'))) continue;

    const sharedSkillPath = path.join(sharedPath, entry.name);
    if (!fs.existsSync(sharedSkillPath)) {
      copyDirectorySync(legacySkillPath, sharedSkillPath);
    }
  }
}

export function mirrorSharedSkillsToClaude(vaultPath: string): void {
  const sharedPath = getSharedSkillsPath(vaultPath);
  if (!fs.existsSync(sharedPath)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sharedPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    mirrorSkillToClaude(vaultPath, entry.name);
  }
}

export function mirrorSkillToClaude(vaultPath: string, skillName: string): void {
  const sharedSkillPath = getSharedSkillPath(vaultPath, skillName);
  if (!fs.existsSync(path.join(sharedSkillPath, 'SKILL.md'))) return;
  copyDirectorySync(sharedSkillPath, getClaudeSkillPath(vaultPath, skillName));
}

export function removeSkillFromBothStores(vaultPath: string, skillName: string): void {
  removeDirectoryIfExists(getSharedSkillPath(vaultPath, skillName));
  removeDirectoryIfExists(getClaudeSkillPath(vaultPath, skillName));
}

export function buildCodexSkillInstructions(vaultPath: string): string {
  const skills = loadSkillCatalog(vaultPath);
  if (skills.length === 0) return '';

  const lines = skills.map((skill) => {
    const relativeSkillPath = path.relative(vaultPath, path.join(skill.path, 'SKILL.md')).split(path.sep).join('/');
    return `- ${skill.name}: ${skill.description} (read ${relativeSkillPath})`;
  });

  return [
    '## Available Skills',
    'Project skills are stored in `.agents/skills` and shared by Claude and Codex.',
    'When the user request clearly matches a skill description, read that skill\'s SKILL.md before acting and follow its workflow.',
    '',
    ...lines,
  ].join('\n');
}

function copyDirectorySync(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectorySync(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function removeDirectoryIfExists(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
