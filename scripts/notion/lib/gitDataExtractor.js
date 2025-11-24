#!/usr/bin/env node
/**
 * Git Data Extractor - Extracts Git metadata for Notion updates
 * Fills Git-related columns automatically
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

export class GitDataExtractor {
  constructor(workingDirectory = process.cwd()) {
    this.cwd = workingDirectory;
  }

  /**
   * Execute git command safely
   */
  execGit(command, defaultValue = '') {
    try {
      const result = execSync(command, {
        cwd: this.cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      return result.trim();
    } catch (error) {
      console.warn(`⚠️  Git command failed: ${command}`);
      return defaultValue;
    }
  }

  /**
   * Get current branch name
   */
  getBranch() {
    return this.execGit('git rev-parse --abbrev-ref HEAD', 'main');
  }

  /**
   * Get current commit hash
   */
  getCommit() {
    return this.execGit('git rev-parse HEAD', '');
  }

  /**
   * Get short commit hash
   */
  getCommitShort() {
    return this.execGit('git rev-parse --short HEAD', '');
  }

  /**
   * Get latest git tag
   */
  getGitTag() {
    return this.execGit('git describe --tags --abbrev=0 2>/dev/null', '');
  }

  /**
   * Get commit count between two references
   * @param {string} since - Starting reference (tag, commit, or HEAD~N)
   * @param {string} until - Ending reference (defaults to HEAD)
   */
  getCommitsCount(since = null, until = 'HEAD') {
    if (since) {
      return parseInt(this.execGit(`git rev-list --count ${since}..${until}`, '0'));
    }
    return parseInt(this.execGit(`git rev-list --count ${until}`, '0'));
  }

  /**
   * Get commit range between two points
   */
  getCommitRange(fromRef, toRef = 'HEAD') {
    const from = this.execGit(`git rev-parse --short ${fromRef}`, '');
    const to = this.execGit(`git rev-parse --short ${toRef}`, '');

    if (from && to) {
      return `${from}..${to}`;
    }
    return '';
  }

  /**
   * Get list of changed files
   */
  getChangedFiles(fromRef = null, toRef = 'HEAD') {
    let command;
    if (fromRef) {
      command = `git diff --name-only ${fromRef}..${toRef}`;
    } else {
      command = 'git diff --name-only HEAD~1..HEAD';
    }

    const files = this.execGit(command, '');
    return files ? files.split('\n').filter(f => f.length > 0) : [];
  }

  /**
   * Get commits for a sprint (between tags or commits)
   */
  getSprintCommits(previousTag, currentTag = 'HEAD') {
    const logFormat = '--pretty=format:%h - %s (%an, %ar)';
    const command = `git log ${logFormat} ${previousTag}..${currentTag}`;

    const logs = this.execGit(command, '');
    return logs ? logs.split('\n').filter(l => l.length > 0) : [];
  }

  /**
   * Extract sprint number from branch or tag
   */
  extractSprintNumber(ref = null) {
    const source = ref || this.getBranch();
    const match = source.match(/sprint[-_]?(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Get comprehensive git data for a sprint
   */
  getSprintGitData(sprintNumber, previousSprintNumber = null) {
    const branch = this.getBranch();
    const commit = this.getCommit();
    const commitShort = this.getCommitShort();
    const gitTag = this.getGitTag();

    // Calculate commit range
    let commitRange = '';
    let commitsCount = 0;
    let changedFiles = [];

    if (previousSprintNumber) {
      const prevTag = `sprint-${previousSprintNumber}`;
      const currentTag = `sprint-${sprintNumber}`;

      // Check if tags exist
      const hasCurrentTag = this.execGit(`git rev-parse ${currentTag} 2>/dev/null`, '');
      const hasPrevTag = this.execGit(`git rev-parse ${prevTag} 2>/dev/null`, '');

      if (hasPrevTag) {
        // Use previous tag as starting point
        const endRef = hasCurrentTag ? currentTag : 'HEAD';

        commitRange = this.getCommitRange(prevTag, endRef);
        commitsCount = this.getCommitsCount(prevTag, endRef);
        changedFiles = this.getChangedFiles(prevTag, endRef);
      } else {
        // Previous tag doesn't exist, estimate based on recent commits
        // This is a fallback and shouldn't happen in normal workflow
        console.warn(`⚠️  Tag ${prevTag} not found, using HEAD~10 as fallback`);
        commitsCount = this.getCommitsCount('HEAD~10', 'HEAD');
        changedFiles = this.getChangedFiles('HEAD~10', 'HEAD');
        commitRange = this.getCommitRange('HEAD~10', 'HEAD');
      }
    } else {
      // No previous sprint specified - look for most recent sprint tag
      const allTags = this.execGit('git tag -l "sprint-*" --sort=-version:refname', '');
      const tags = allTags ? allTags.split('\n').filter(t => t.length > 0) : [];

      if (tags.length > 0) {
        // Use most recent sprint tag as starting point
        const prevTag = tags[0];
        console.log(`ℹ️  Using most recent tag ${prevTag} as reference`);
        commitsCount = this.getCommitsCount(prevTag, 'HEAD');
        changedFiles = this.getChangedFiles(prevTag, 'HEAD');
        commitRange = this.getCommitRange(prevTag, 'HEAD');
      } else {
        // No tags found, count recent commits only
        console.warn('⚠️  No sprint tags found, using HEAD~5 as fallback');
        commitsCount = this.getCommitsCount('HEAD~5', 'HEAD');
        changedFiles = this.getChangedFiles('HEAD~5', 'HEAD');
        commitRange = this.getCommitRange('HEAD~5', 'HEAD');
      }
    }

    return {
      branch,
      commit,
      commitShort,
      gitTag: gitTag || `sprint-${sprintNumber}`,
      commitsCount,
      commitRange,
      changedFiles,
      filesCount: changedFiles.length,
      syncedAt: new Date().toISOString()
    };
  }

  /**
   * Format file list for Notion (max 2000 chars)
   */
  formatFileList(files, maxLength = 2000) {
    const fileList = files.join('\n');

    if (fileList.length <= maxLength) {
      return fileList;
    }

    // Truncate with summary
    const truncated = fileList.substring(0, maxLength - 50);
    const lastNewline = truncated.lastIndexOf('\n');
    const visibleFiles = truncated.substring(0, lastNewline).split('\n').length;

    return truncated.substring(0, lastNewline) +
           `\n... (${files.length - visibleFiles} more files)`;
  }

  /**
   * Get recent commit messages
   */
  getRecentCommitMessages(count = 10) {
    const command = `git log -${count} --pretty=format:"%h - %s"`;
    const logs = this.execGit(command, '');
    return logs ? logs.split('\n') : [];
  }

  /**
   * Check if working directory is clean
   */
  isWorkingDirectoryClean() {
    const status = this.execGit('git status --porcelain', '');
    return status.length === 0;
  }

  /**
   * Get repository remote URL
   */
  getRemoteUrl() {
    return this.execGit('git config --get remote.origin.url', '');
  }

  /**
   * Print git data summary
   */
  printGitData(sprintNumber, previousSprintNumber = null) {
    const data = this.getSprintGitData(sprintNumber, previousSprintNumber);

    console.log('\n' + '='.repeat(70));
    console.log(`GIT DATA FOR SPRINT ${sprintNumber}`);
    console.log('='.repeat(70));
    console.log(`Branch:        ${data.branch}`);
    console.log(`Commit:        ${data.commit}`);
    console.log(`Short Commit:  ${data.commitShort}`);
    console.log(`Git Tag:       ${data.gitTag}`);
    console.log(`Commits Count: ${data.commitsCount}`);
    console.log(`Commit Range:  ${data.commitRange}`);
    console.log(`Files Changed: ${data.filesCount}`);
    console.log(`Synced At:     ${data.syncedAt}`);
    console.log('='.repeat(70));

    if (data.changedFiles.length > 0) {
      console.log('\nChanged Files:');
      data.changedFiles.slice(0, 10).forEach(file => {
        console.log(`  • ${file}`);
      });
      if (data.changedFiles.length > 10) {
        console.log(`  ... and ${data.changedFiles.length - 10} more`);
      }
    }
  }
}
