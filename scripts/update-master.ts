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

interface MasterMember {
  job: string;
  group: string;
  name: string;
  youtube_id: string;
  options?: string[];
}

interface MasterJson {
  members: MasterMember[];
}

// Constants
const DATA_DIR = path.resolve(process.cwd(), "data");
const MASTER_JSON_PATH = path.join(DATA_DIR, "master.json");
const EXCLUDED_FILES = ["schema.json", "members.template.json", "jobs.json", "master.json"];

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
 * Get all group directories with members.json from a job directory
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
 * Convert members.json to flat master members
 */
function convertToMasterMembers(
  membersJson: MembersJson,
): MasterMember[] {
  const masterMembers: MasterMember[] = [];

  for (const member of membersJson.members) {
    const masterMember: MasterMember = {
      job: membersJson.metadata.job,
      group: membersJson.metadata.group,
      name: member.name,
      youtube_id: member.youtube_id,
    };

    // Add options only if they exist and are not null
    if (member.options && member.options.length > 0) {
      masterMember.options = member.options;
    }

    masterMembers.push(masterMember);
  }

  return masterMembers;
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
  console.log("🚀 Starting master.json generation...\n");

  const allMembers: MasterMember[] = [];
  let totalGroups = 0;
  let processedGroups = 0;

  // 1. Get all job directories
  const jobNames = getJobDirectories();
  console.log(`📁 Found ${jobNames.length} job(s): ${jobNames.join(", ")}\n`);

  if (jobNames.length === 0) {
    console.warn("⚠️  No job directories found. Creating empty master.json.");
    const masterJson: MasterJson = { members: [] };
    writeJsonFile(MASTER_JSON_PATH, masterJson);
    console.log(`✅ Created empty: ${MASTER_JSON_PATH}\n`);
    return;
  }

  // 2. Process each job and collect all members
  for (const jobName of jobNames) {
    const groupNames = getGroupDirectories(jobName);
    totalGroups += groupNames.length;

    console.log(
      `📁 [${jobName}] Processing ${groupNames.length} group(s)...`,
    );

    if (groupNames.length === 0) {
      console.warn(`   ⚠️  No valid groups found. Skipping.\n`);
      continue;
    }

    for (const groupName of groupNames) {
      const membersJson = readMembersJson(jobName, groupName);

      if (!membersJson) {
        console.warn(`   ⚠️  Skipping ${groupName}: Failed to read members.json`);
        continue;
      }

      const masterMembers = convertToMasterMembers(membersJson);
      allMembers.push(...masterMembers);
      processedGroups++;

      console.log(
        `   ✅ ${groupName}: Added ${masterMembers.length} member(s)`,
      );
    }

    console.log();
  }

  // 3. Generate master.json
  const masterJson: MasterJson = {
    members: allMembers,
  };

  writeJsonFile(MASTER_JSON_PATH, masterJson);

  // 4. Summary
  console.log("📊 Summary:");
  console.log(`   Jobs processed: ${jobNames.length}`);
  console.log(`   Groups processed: ${processedGroups}/${totalGroups}`);
  console.log(`   Total members: ${allMembers.length}`);
  console.log();
  console.log(`✅ Generated: ${MASTER_JSON_PATH}\n`);
  console.log("🎉 Master.json generation complete!\n");
}

// Execute
main();
