# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a data repository for managing VTuber information using JSON-based structured data. The repository contains metadata and member information for various VTuber groups, validated against a JSON schema.

## Data Structure

### Schema Definition
- `data/schema.json`: JSON Schema that defines the required structure for all VTuber data files
- `data/template.json`: Template file for creating new VTuber group data

### Data Organization
- `data/VTuber/{group_name}/data.json`: Each VTuber group has its own directory with a `data.json` file
- Existing groups: にじさんじ, ホロライブ, ぶいすぽっ！, Neo-Porte, VShojo, .LIVE, 登龍門BOX, 個人勢

### Data Format
Each `data.json` file must follow this structure:
```json
{
  "metadata": {
    "job": "VTuber",
    "groups": "Group Name",
    "options": ["Generation/Period tags"],
    "source": "Official website URL"
  },
  "members": [
    {
      "name": "VTuber Name",
      "youtube_id": "YouTube Channel ID (UC...) or handle (@...)",
      "options": ["Generation/Period tags"]
    }
  ]
}
```

## Environment Variables

- `YOUTUBE_API_KEY`: YouTube Data API v3 key (stored in `.env`)

## Validation Rules

When adding or modifying VTuber data:
1. Ensure JSON structure matches `data/schema.json`
2. `youtube_id` must match pattern: `^(UC[a-zA-Z0-9_-]{22}|@[a-zA-Z0-9_-]+)$`
3. All required fields (`name`, `youtube_id` in members; `job`, `groups`, `source` in metadata) must be present
4. Validate JSON syntax before committing

## Working with Data

### Adding a New VTuber Group
1. Create directory: `data/VTuber/{group_name}/`
2. Copy `data/template.json` as starting point
3. Fill in metadata and members information
4. Validate against schema

### Updating Existing Data
1. Locate the appropriate `data/VTuber/{group_name}/data.json`
2. Modify member information or metadata
3. Ensure schema compliance
4. Verify YouTube IDs are correct
