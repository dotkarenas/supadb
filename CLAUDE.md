# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a data repository for managing VTuber information using JSON-based structured data. The repository contains metadata and member information for various VTuber groups, which can be synced to a Supabase database.

## Setup

### Install Dependencies
```bash
npm install
```

### Environment Variables

Create `.env.local` (for development) and `.env.production` (for production) files with:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
YOUTUBE_API_KEY=your_youtube_api_key
```

## Commands

### Validation
```bash
npm run validate -- data/VTuber/{group_name}/data.json
```
Validates a data.json file against the JSON schema using AJV.

### Bulk Thread Creation

**Development (Local Supabase)**
```bash
npm run bulk-create:development data/VTuber/{group_name}/data.json
```

**Production**
```bash
npm run bulk-create:production data/VTuber/{group_name}/data.json
```

Syncs VTuber data to Supabase:
- Creates threads in the `threads` table with YouTube channel info and avatars
- Updates existing threads if data has changed (name, YouTube title, tags)
- Uploads channel thumbnails to Supabase Storage (`threads` bucket)
- Associates tags (job, group, options) with threads via `thread_tags` table
- Uses YouTube Data API v3 to fetch channel metadata
- Includes rate limiting (100ms delay between API calls)

## Architecture

### Data Layer
- `data/schema.json`: JSON Schema defining the structure for all VTuber data
- `data/template.json`: Template for creating new group data files
- `data/VTuber/{group_name}/data.json`: Per-group VTuber data files

### Supabase Integration
The `bulk-create-threads.ts` script integrates with Supabase:
- **Database Tables**:
  - `threads`: Stores VTuber info (id, name, youtube_id, youtube_title, avatar_path)
  - `tags`: Tag definitions (id, name)
  - `thread_tags`: Many-to-many relationship (thread_id, tag_id)
- **Storage**: `threads` bucket stores channel avatars at path `{thread_id}/avatar/{timestamp}.jpg`
- **Authentication**: Uses service role key to bypass RLS

### Tag System
Tags are automatically created from:
1. `metadata.job` (e.g., "VTuber")
2. `metadata.groups` (e.g., "ホロライブ")
3. `member.options` (e.g., ["ホロライブ 0期生"])

When syncing existing threads, the script compares current tags with expected tags from data.json and updates accordingly.

## Environment Variables

Required in `.env.local` (development) and `.env.production` (production):
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations
- `YOUTUBE_API_KEY`: YouTube Data API v3 key

## Data Structure

Each `data.json` follows this schema:
```json
{
  "metadata": {
    "job": "VTuber",
    "groups": "Group Name",
    "options": ["Optional tags"],
    "source": "Official website URL"
  },
  "members": [
    {
      "name": "VTuber Name",
      "youtube_id": "UC... or @handle",
      "options": ["Member-specific tags"]
    }
  ]
}
```

### YouTube ID Formats
- Channel ID: `UCxxxxxxxxxxxxxxxxxxx` (22 characters after UC)
- Handle: `@username`

## Validation Rules

- `youtube_id` must match: `^(UC[a-zA-Z0-9_-]{22}|@[a-zA-Z0-9_-]+)$`
- Required fields: `metadata.job`, `metadata.groups`, `member.name`, `member.youtube_id`
- Optional fields: `metadata.options`, `metadata.source`, `member.options`

## Working with Data

### Adding New VTuber Group
1. Create directory: `data/VTuber/{group_name}/`
2. Copy `data/template.json` as starting point
3. Fill in metadata and members
4. Validate: `npm run validate -- data/VTuber/{group_name}/data.json`
5. Sync to Supabase:
   - Development: `npm run bulk-create:development data/VTuber/{group_name}/data.json`
   - Production: `npm run bulk-create:production data/VTuber/{group_name}/data.json`

### Updating Existing Data
1. Edit `data/VTuber/{group_name}/data.json`
2. Validate changes against schema
3. Re-run bulk-create to sync updates (script handles updates automatically)

### Sync Behavior
The bulk-create script is idempotent:
- Creates new threads for new members
- Updates existing threads if name, YouTube title, or tags changed
- Skips unchanged threads
- Reports summary (success/skipped/failed counts)

## Troubleshooting

### YouTube API Quota
- The script includes 100ms delay between API calls to avoid quota issues
- If you hit quota limits, wait or apply for increased quota
- Channel ID format: `UCxxxxxxxxxxxxxxxxxxx` (22 chars after UC)
- Handle format: `@username`

### Common Validation Errors
- `youtube_id` must match pattern: `^(UC[a-zA-Z0-9_-]{22}|@[a-zA-Z0-9_-]+)$`
- Required fields: `metadata.job`, `metadata.groups`, `member.name`, `member.youtube_id`
- Optional fields can be `null` or array of strings
