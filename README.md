# DHL Telegram Bot

A Telegram bot that creates real DHL shipping labels through conversational AI.

## Features

- 📦 **Real DHL Shipping Labels** via DHL Parcel DE API
- 🗺️ **Address Validation** using Google Maps API
- 💬 **Conversational AI** with OpenAI integration
- 🔐 **Per-User Credentials** - each user provides their own DHL account
- 🎤 **Voice Messages** with speech-to-text
- 📷 **Image Support** for visual shipping information
- 📋 **Shipment Management** - track, list, and cancel shipments
- 🇩🇪 **German Interface** with emoji and markdown formatting

## Quick Setup

### 1. Prerequisites
- Node.js (v14+)
- Telegram Bot Token ([BotFather](https://t.me/botfather))
- OpenAI API Key ([OpenAI Platform](https://platform.openai.com/api-keys))
- Google Maps API Key ([Google Cloud Console](https://console.cloud.google.com/))
- DHL API Access ([DHL Developer Portal](https://developer.dhl.com/))

### 2. Installation
```bash
git clone <repository>
cd dhlBot
npm install
cp .env.example .env
```

### 3. Configuration
Edit `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
DHL_CLIENT_ID=your_dhl_client_id
DHL_CLIENT_SECRET=your_dhl_client_secret
DHL_USE_SANDBOX=true
```

### 4. Run
```bash
npm start
```

## How It Works

1. **User Initialization**: New users provide their DHL business account credentials
2. **Conversation**: Users describe shipping needs in natural language
3. **Address Validation**: Addresses are validated with Google Maps API
4. **Label Creation**: Real DHL shipping labels are generated and delivered as PDFs
5. **Management**: Users can track, list, and cancel their shipments

## Demo:

![QR Code Demo](qr.png)

## User Experience

- **Text, Voice, or Images**: Multiple input methods supported
- **Markdown Formatting**: Rich text with emojis for better readability
- **Persistent Storage**: User addresses and shipment history saved
- **Multi-User**: Each user has their own DHL credentials and shipment history

## Architecture

- `bot.js` - Main bot logic and message handling
- `src/database.js` - SQLite database operations
- `src/systemPrompt.js` - Dynamic AI prompts
- `src/toolExecutor.js` - OpenAI function calling
- `src/dhlApi.js` - DHL API integration
- `src/addressValidation.js` - Google Maps integration

## License

0BSD License 