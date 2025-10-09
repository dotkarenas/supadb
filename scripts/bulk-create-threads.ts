#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables based on NODE_ENV
const env = process.env.NODE_ENV || "development";
const envFile = env === "production" ? ".env.production" : ".env.local";
dotenv.config({ path: envFile });

console.log(`🔧 Environment: ${env}`);
console.log(`📄 Loaded env file: ${envFile}\n`);

// Environment variables validation
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;

// Create Supabase admin client (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Types
interface DataJson {
  metadata: {
    job: string;
    groups: string;
    options: string[] | null;
    source: string | null;
  };
  members: Array<{
    name: string;
    youtube_id: string;
    options: string[] | null;
  }>;
}

interface YouTubeChannelResponse {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
  }>;
}

// YouTube API helper
async function getChannelInfo(youtubeId: string): Promise<{
  channelId: string;
  title: string;
  thumbnailUrl: string;
} | null> {
  try {
    // Check if it's a channel ID (UCxxx...) or handle (@xxx)
    let url: string;
    if (youtubeId.startsWith("UC")) {
      url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${youtubeId}&key=${YOUTUBE_API_KEY}`;
    } else if (youtubeId.startsWith("@")) {
      const handle = youtubeId.substring(1);
      url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${handle}&key=${YOUTUBE_API_KEY}`;
    } else {
      console.error(`Invalid youtube_id format: ${youtubeId}`);
      return null;
    }

    const response = await fetch(url);
    const data: YouTubeChannelResponse = await response.json();

    if (!response.ok) {
      console.error(
        `YouTube API error: ${response.status} ${response.statusText}`,
      );
      console.error(`Response:`, JSON.stringify(data, null, 2));
      return null;
    }
    const channel = data.items?.[0];

    if (!channel) {
      console.error(`Channel not found: ${youtubeId}`);
      return null;
    }

    const thumbnails = channel.snippet.thumbnails;
    const thumbnailUrl =
      thumbnails?.high?.url ||
      thumbnails?.medium?.url ||
      thumbnails?.default?.url;

    if (!thumbnailUrl) {
      console.error(`No thumbnail found for channel: ${youtubeId}`);
      return null;
    }

    return {
      channelId: channel.id,
      title: channel.snippet.title,
      thumbnailUrl,
    };
  } catch (error) {
    console.error(`Error fetching channel info for ${youtubeId}:`, error);
    return null;
  }
}

// Download image and return as Blob
async function downloadImage(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }
    return await response.blob();
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    return null;
  }
}

// Get or create tag by name
async function getOrCreateTag(tagName: string): Promise<string | null> {
  // First, try to find existing tag
  const { data: existingTag } = await supabase
    .from("tags")
    .select("id")
    .eq("name", tagName)
    .single();

  if (existingTag) {
    return existingTag.id;
  }

  // If not found, create new tag
  const { data: newTag, error: createError } = await supabase
    .from("tags")
    .insert({ name: tagName })
    .select("id")
    .single();

  if (createError || !newTag) {
    console.error(`❌ Failed to create tag "${tagName}":`, createError);
    return null;
  }

  return newTag.id;
}

// Associate tags with thread
async function associateTagsWithThread(
  threadId: string,
  tagNames: string[],
): Promise<boolean> {
  if (tagNames.length === 0) {
    return true;
  }

  // Get or create all tags
  const tagIds: string[] = [];
  for (const tagName of tagNames) {
    const tagId = await getOrCreateTag(tagName);
    if (!tagId) {
      return false;
    }
    tagIds.push(tagId);
  }

  // Create thread_tags records
  const threadTags = tagIds.map((tagId) => ({
    thread_id: threadId,
    tag_id: tagId,
  }));

  const { error } = await supabase.from("thread_tags").insert(threadTags);

  if (error) {
    console.error(`❌ Failed to associate tags:`, error);
    return false;
  }

  return true;
}

// Create thread
async function createThread(
  member: {
    name: string;
    youtube_id: string;
    options: string[] | null;
  },
  metadata: {
    job: string;
    groups: string;
  },
): Promise<boolean> {
  console.log(`\n📝 Processing: ${member.name} (${member.youtube_id})`);

  // 1. Get YouTube channel info
  const channelInfo = await getChannelInfo(member.youtube_id);
  if (!channelInfo) {
    console.error(`❌ Failed to fetch YouTube info for ${member.name}`);
    return false;
  }

  console.log(`   ✓ YouTube info retrieved: ${channelInfo.title}`);

  // 2. Check if thread already exists
  const { data: existingThread } = await supabase
    .from("threads")
    .select("id, youtube_id")
    .eq("youtube_id", channelInfo.channelId)
    .single();

  if (existingThread) {
    console.log(`   ⚠️  Thread already exists (ID: ${existingThread.id})`);

    let needsUpdate = false;

    console.log(`   ℹ️  Synchronizing with members.json...`);

    // 1. Get current thread data
    const { data: currentThread } = await supabase
      .from("threads")
      .select("name, youtube_title")
      .eq("id", existingThread.id)
      .single();

    if (!currentThread) {
      console.error(`❌ Failed to fetch current thread data`);
      return false;
    }

    // 2. Update name if different
    if (currentThread.name !== member.name) {
      console.log(
        `   ℹ️  Updating name: "${currentThread.name}" → "${member.name}"`,
      );
      const { error: updateNameError } = await supabase
        .from("threads")
        .update({ name: member.name })
        .eq("id", existingThread.id);

      if (updateNameError) {
        console.error(`❌ Failed to update name:`, updateNameError);
        return false;
      }
      console.log(`   ✓ Name updated`);
      needsUpdate = true;
    }

    // 3. Update youtube_title if different
    if (currentThread.youtube_title !== channelInfo.title) {
      console.log(
        `   ℹ️  Updating YouTube title: "${currentThread.youtube_title}" → "${channelInfo.title}"`,
      );
      const { error: updateTitleError } = await supabase
        .from("threads")
        .update({ youtube_title: channelInfo.title })
        .eq("id", existingThread.id);

      if (updateTitleError) {
        console.error(`❌ Failed to update youtube_title:`, updateTitleError);
        return false;
      }
      console.log(`   ✓ YouTube title updated`);
      needsUpdate = true;
    }

    // 4. Synchronize tags (delete old, add new)
    // Build expected tag names from members.json
    const expectedTagNames: string[] = [];
    if (metadata.job) expectedTagNames.push(metadata.job);
    if (metadata.groups) expectedTagNames.push(metadata.groups);
    if (member.options && Array.isArray(member.options)) {
      expectedTagNames.push(...member.options);
    }

    // Get current tags
    const { data: currentThreadTags } = await supabase
      .from("thread_tags")
      .select("tag_id, tags(name)")
      .eq("thread_id", existingThread.id);

    const currentTagNames =
      currentThreadTags?.map((tt: any) => tt.tags?.name).filter(Boolean) || [];

    // Check if tags need to be updated
    const tagsMatch =
      expectedTagNames.length === currentTagNames.length &&
      expectedTagNames.every((tag) => currentTagNames.includes(tag));

    if (!tagsMatch) {
      console.log(
        `   ℹ️  Updating tags: [${currentTagNames.join(", ")}] → [${expectedTagNames.join(", ")}]`,
      );

      // Delete all existing thread_tags
      const { error: deleteTagsError } = await supabase
        .from("thread_tags")
        .delete()
        .eq("thread_id", existingThread.id);

      if (deleteTagsError) {
        console.error(`❌ Failed to delete old tags:`, deleteTagsError);
        return false;
      }

      // Add new tags
      if (expectedTagNames.length > 0) {
        const tagsSuccess = await associateTagsWithThread(
          existingThread.id,
          expectedTagNames,
        );
        if (!tagsSuccess) {
          console.error(`❌ Failed to associate new tags`);
          return false;
        }
      }

      console.log(`   ✓ Tags synchronized`);
      needsUpdate = true;
    }

    if (!needsUpdate) {
      console.log(`   ℹ️  No changes needed, skipping`);
      return true;
    }

    console.log(`   ✅ Updated thread for ${member.name}`);
    return true;
  }

  // 3. Download thumbnail
  const imageBlob = await downloadImage(channelInfo.thumbnailUrl);
  if (!imageBlob) {
    console.error(`❌ Failed to download thumbnail for ${member.name}`);
    return false;
  }

  console.log(`   ✓ Thumbnail downloaded`);

  // 4. Create thread record
  const { data: thread, error: createError } = await supabase
    .from("threads")
    .insert({
      name: member.name,
      youtube_id: channelInfo.channelId,
      youtube_title: channelInfo.title,
      avatar_path: "", // Will update after upload
    })
    .select("id")
    .single();

  if (createError || !thread) {
    console.error(`❌ Failed to create thread:`, createError);
    return false;
  }

  console.log(`   ✓ Thread created (ID: ${thread.id})`);

  // 5. Upload avatar to storage
  const timestamp = Date.now();
  const avatarPath = `${thread.id}/avatar/${timestamp}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("threads")
    .upload(avatarPath, imageBlob, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    console.error(`❌ Failed to upload avatar:`, uploadError);
    // Rollback: delete thread
    await supabase.from("threads").delete().eq("id", thread.id);
    return false;
  }

  console.log(`   ✓ Avatar uploaded: ${avatarPath}`);

  // 6. Update thread with avatar_path
  const { error: updateError } = await supabase
    .from("threads")
    .update({ avatar_path: avatarPath })
    .eq("id", thread.id);

  if (updateError) {
    console.error(`❌ Failed to update avatar_path:`, updateError);
    return false;
  }

  console.log(`   ✓ Avatar path updated`);

  // 7. Associate tags with thread
  const tagNames: string[] = [];

  // Add job tag (e.g., "VTuber")
  if (metadata.job) {
    tagNames.push(metadata.job);
  }

  // Add group tag (e.g., "ホロライブ")
  if (metadata.groups) {
    tagNames.push(metadata.groups);
  }

  // Add member-specific tags (e.g., ["ホロライブ 0期生"])
  if (member.options && Array.isArray(member.options)) {
    tagNames.push(...member.options);
  }

  if (tagNames.length > 0) {
    const tagsSuccess = await associateTagsWithThread(thread.id, tagNames);
    if (!tagsSuccess) {
      console.error(`❌ Failed to associate tags for ${member.name}`);
      // Don't rollback thread, just report error
      return false;
    }
    console.log(`   ✓ Tags associated: ${tagNames.join(", ")}`);
  }

  console.log(`   ✅ Successfully created thread for ${member.name}`);
  return true;
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "❌ Usage: tsx scripts/bulk-create-threads.ts <path-to-members.json>",
    );
    console.error(
      "   Example: tsx scripts/bulk-create-threads.ts data/VTuber/ホロライブ/members.json",
    );
    process.exit(1);
  }

  const dataFilePath = path.resolve(process.cwd(), args[0]);

  // Check if file exists
  if (!fs.existsSync(dataFilePath)) {
    console.error(`❌ File not found: ${dataFilePath}`);
    process.exit(1);
  }

  // Read and parse JSON
  let data: DataJson;
  try {
    const fileContent = fs.readFileSync(dataFilePath, "utf-8");
    data = JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Failed to parse JSON file:`, error);
    process.exit(1);
  }

  console.log(`\n🚀 Starting bulk thread creation`);
  console.log(`📁 File: ${dataFilePath}`);
  console.log(`👥 Group: ${data.metadata.groups}`);
  console.log(`📊 Total members: ${data.members.length}\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  // Process each member
  for (let i = 0; i < data.members.length; i++) {
    const member = data.members[i];
    console.log(`[${i + 1}/${data.members.length}]`);

    const result = await createThread(member, {
      job: data.metadata.job,
      groups: data.metadata.groups,
    });

    if (result) {
      const { data: existingThread } = await supabase
        .from("threads")
        .select("id")
        .eq(
          "youtube_id",
          member.youtube_id.startsWith("UC")
            ? member.youtube_id
            : member.youtube_id,
        )
        .single();

      if (existingThread) {
        skipCount++;
      } else {
        successCount++;
      }
    } else {
      failCount++;
    }

    // Rate limiting: wait 100ms between requests to avoid YouTube API quota issues
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ Summary:`);
  console.log(`   Total:   ${data.members.length}`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Skipped: ${skipCount} (already exists)`);
  console.log(`   Failed:  ${failCount}`);
  console.log(`${"=".repeat(50)}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// Execute
main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
