#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";

// Types
interface MembersJson {
  metadata: {
    job: string;
    group: string;
    options?: string[] | null;
    source?: string | null;
  };
  members: Array<{
    name: string;
    youtube_id: string;
    options?: string[] | null;
  }>;
}

interface JobMetadata {
  name: string;
}

interface GroupMetadata {
  name: string;
  source: string | null;
}

interface JobsJson {
  metadata: Record<string, never>;
  jobs: JobMetadata[];
}

interface GroupsJson {
  metadata: Record<string, never>;
  groups: GroupMetadata[];
}

// Constants
const DATA_DIR = path.resolve(process.cwd(), "data");
const EXCLUDED_FILES = ["schema.json", "members.template.json", "jobs.json"];

/**
 * Check if path is a directory and not hidden
 */
function isValidDirectory(dirPath: string): boolean {
  try {
    const stat = fs.statSync(dirPath);
    const basename = path.basename(dirPath);
    return stat.isDirectory() && !basename.startsWith(".");
  } catch {
    return false;
  }
}

/**
 * Get all job directories from data/
 */
function getJobDirectories(): string[] {
  const entries = fs.readdirSync(DATA_DIR);
  const jobDirs: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(DATA_DIR, entry);

    // Skip excluded files
    if (EXCLUDED_FILES.includes(entry)) {
      continue;
    }

    // Check if it's a valid directory
    if (isValidDirectory(fullPath)) {
      jobDirs.push(entry);
    }
  }

  return jobDirs.sort();
}

/**
 * Get all group directories from a job directory
 */
function getGroupDirectories(jobName: string): string[] {
  const jobPath = path.join(DATA_DIR, jobName);
  const entries = fs.readdirSync(jobPath);
  const groupDirs: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(jobPath, entry);

    // Skip groups.json
    if (entry === "groups.json") {
      continue;
    }

    // Check if it's a valid directory
    if (isValidDirectory(fullPath)) {
      // Check if members.json exists
      const membersJsonPath = path.join(fullPath, "members.json");
      if (fs.existsSync(membersJsonPath)) {
        groupDirs.push(entry);
      } else {
        console.warn(
          `⚠️  Skipping ${jobName}/${entry}: members.json not found`,
        );
      }
    }
  }

  return groupDirs.sort();
}

/**
 * Read and parse members.json
 */
function readMembersJson(
  jobName: string,
  groupName: string,
): MembersJson | null {
  const membersJsonPath = path.join(
    DATA_DIR,
    jobName,
    groupName,
    "members.json",
  );

  try {
    const content = fs.readFileSync(membersJsonPath, "utf-8");
    return JSON.parse(content) as MembersJson;
  } catch (error) {
    console.error(
      `❌ Failed to parse ${jobName}/${groupName}/members.json:`,
      error,
    );
    return null;
  }
}

/**
 * Generate jobs.json
 */
function generateJobsJson(jobNames: string[]): JobsJson {
  return {
    metadata: {},
    jobs: jobNames.map((name) => ({ name })),
  };
}

/**
 * Read existing groups.json if it exists
 */
function readExistingGroupsJson(jobName: string): GroupsJson | null {
  const groupsJsonPath = path.join(DATA_DIR, jobName, "groups.json");

  if (!fs.existsSync(groupsJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(groupsJsonPath, "utf-8");
    return JSON.parse(content) as GroupsJson;
  } catch (error) {
    console.warn(`⚠️  Failed to parse existing ${jobName}/groups.json:`, error);
    return null;
  }
}

/**
 * Generate groups.json for a specific job
 */
function generateGroupsJson(jobName: string, groupNames: string[]): GroupsJson {
  // Read existing groups.json to preserve entries without members.json
  const existingGroupsJson = readExistingGroupsJson(jobName);
  const existingGroupsMap = new Map<string, GroupMetadata>();

  if (existingGroupsJson) {
    for (const group of existingGroupsJson.groups) {
      existingGroupsMap.set(group.name, group);
    }
  }

  const groups: GroupMetadata[] = [];
  const processedGroupNames = new Set<string>();

  // Process groups with members.json
  for (const groupName of groupNames) {
    const membersJson = readMembersJson(jobName, groupName);

    if (!membersJson) {
      // Fallback: use directory name if members.json can't be read
      console.warn(
        `⚠️  Using directory name as fallback for ${jobName}/${groupName}`,
      );
      groups.push({
        name: groupName,
        source: null,
      });
      processedGroupNames.add(groupName);
      continue;
    }

    const groupDisplayName = membersJson.metadata.group || groupName;
    processedGroupNames.add(groupDisplayName);

    // Check if this group already exists in the map
    const existingGroup = existingGroupsMap.get(groupDisplayName);

    groups.push({
      name: groupDisplayName,
      source: membersJson.metadata.source || existingGroup?.source || null,
    });
  }

  // Preserve entries from existing groups.json that don't have members.json yet
  if (existingGroupsJson) {
    for (const existingGroup of existingGroupsJson.groups) {
      if (!processedGroupNames.has(existingGroup.name)) {
        groups.push(existingGroup);
        console.log(`   ℹ️  Preserved group: ${existingGroup.name}`);
      }
    }
  }

  return {
    metadata: {},
    groups,
  };
}

/**
 * Write JSON file with pretty formatting
 */
function writeJsonFile(filePath: string, data: unknown): void {
  const jsonContent = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(filePath, jsonContent, "utf-8");
}

/**
 * Main function
 */
function main() {
  console.log("🚀 Starting metadata update...\n");

  // 1. Get all job directories
  const jobNames = getJobDirectories();
  console.log(`📁 Found ${jobNames.length} job(s): ${jobNames.join(", ")}\n`);

  if (jobNames.length === 0) {
    console.warn("⚠️  No job directories found. Nothing to update.");
    return;
  }

  // 2. Generate and write jobs.json
  const jobsJson = generateJobsJson(jobNames);
  const jobsJsonPath = path.join(DATA_DIR, "jobs.json");
  writeJsonFile(jobsJsonPath, jobsJson);
  console.log(`✅ Updated: ${jobsJsonPath}\n`);

  // 3. Generate and write groups.json for each job
  for (const jobName of jobNames) {
    const groupNames = getGroupDirectories(jobName);
    console.log(
      `📁 [${jobName}] Found ${groupNames.length} group(s): ${groupNames.join(", ")}`,
    );

    if (groupNames.length === 0) {
      console.warn(`⚠️  [${jobName}] No valid groups found. Skipping.\n`);
      continue;
    }

    const groupsJson = generateGroupsJson(jobName, groupNames);
    const groupsJsonPath = path.join(DATA_DIR, jobName, "groups.json");
    writeJsonFile(groupsJsonPath, groupsJson);
    console.log(`✅ Updated: ${groupsJsonPath}\n`);
  }

  console.log("🎉 Metadata update complete!\n");
}

// Execute
main();
