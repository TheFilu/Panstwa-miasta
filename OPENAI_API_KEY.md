# OpenAI API Key Configuration

## Problem
If you see this error when validating answers:
```
AuthenticationError: 401 Incorrect API key provided
```

This means your OpenAI API key in `.env` is invalid or has expired.

## Solution

### Option 1: Update API Key (Recommended)
1. Get a new API key from [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Update the `.env` file:
   ```
   AI_INTEGRATIONS_OPENAI_API_KEY=sk-proj-YOUR_NEW_KEY_HERE
   ```
3. Restart the development server:
   ```bash
   npm run dev
   ```

### Option 2: Use Fallback Mode (Temporary)
If you don't have an OpenAI API key yet, the system will automatically use a fallback validation mode:
- Words must start with the correct letter
- No duplicates across players = 10 points
- Duplicates = 5 points
- Invalid/wrong letter = 0 points

The fallback mode is **basic but functional** for testing the game.

## Fallback Validation Rules

When AI validation is unavailable, words are validated as follows:

| Condition | Points | Notes |
|-----------|--------|-------|
| Starts with correct letter, unique | 10 | No other player submitted this word |
| Starts with correct letter, duplicate | 5 | Another player submitted the same word |
| Wrong letter | 0 | Invalid submission |
| Empty/blank | 0 | Invalid submission |

## Server Logs

When you start the server with an invalid API key, you'll see:
```
⚠️  WARNING: OpenAI API key may have invalid format
```

During gameplay, validation errors will show:
```
[Game] ❌ OpenAI API Authentication failed. Update your API key in .env file.
[Game] Fallback validation active...
```

This is **not fatal** - the game continues with fallback validation.

## Getting an OpenAI API Key

1. Visit https://platform.openai.com/account/api-keys
2. Sign in (or create account)
3. Click "Create new secret key"
4. Copy the key (starts with `sk-proj-...`)
5. Add to your `.env` file
6. Restart the server

**Note:** Keep your API key secret! Don't commit `.env` to git.
