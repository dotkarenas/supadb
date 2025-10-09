# supadb

The database of [supaboards.com](https://supaboards.com)

## Overview

This is a data repository for managing VTuber information using JSON-based structured data. The repository contains metadata and member information for various VTuber groups, which can be synced to a Supabase database.

## Requirements

- Node.js

## Setup

```bash
npm install
```

### Environment Variables

Create `.env.local` (for development) and `.env.production` (for production):

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
YOUTUBE_API_KEY=your_youtube_api_key
```

## Usage

### Validate Data

```bash
npm run validate -- data/VTuber/{group_name}/members.json
```

### Sync to Supabase

**Development:**
```bash
npm run bulk-create:development data/VTuber/{group_name}/members.json
```

**Production:**
```bash
npm run bulk-create:production data/VTuber/{group_name}/members.json
```

## Contributing

### Adding or Updating VTuber Data

1. Fork this repository
2. Add or edit JSON files in `data/VTuber/{group_name}/members.json`
3. Validate your changes: `npm run validate -- data/VTuber/{group_name}/members.json`
4. Submit a pull request

### Data Structure

Each `members.json` follows this schema:

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

### Validation Rules

- `youtube_id` must match: `^(UC[a-zA-Z0-9_-]{22}|@[a-zA-Z0-9_-]+)$`
- Required fields: `metadata.job`, `metadata.groups`, `member.name`, `member.youtube_id`
- Optional fields: `metadata.options`, `metadata.source`, `member.options`

## Data Structure

- `data/schema.json`: JSON Schema definition
- `data/template.json`: Template for new groups
- `data/VTuber/{group_name}/members.json`: VTuber data files

## License

This project is open source.
