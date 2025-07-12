# DHL Telegram Bot with OpenAI Integration

<div align="center">
  <img src="logo.png" alt="DHL Logo" width="200"/>
  <br/>
  <em>Automated DHL shipping label creation through conversational AI</em>
</div>

---

A Telegram bot that allows users to create real DHL shipping labels through natural conversation with OpenAI's language models.

## Features

- 📦 **Real DHL Shipping Labels**: Creates actual DHL shipping labels via DHL Parcel DE API
- 🗺️ **Address Validation**: Uses Google Maps API to validate addresses before processing
- 💾 **Persistent Storage**: Sender addresses stored in SQLite database for reuse
- 🔐 **User Authorization**: Whitelist-based access control with user ID verification
- 💬 **Conversational AI**: Natural language interaction with OpenAI models
- 🔄 **"Start New Conversation"** button to reset chat history
- 📝 **Conversation History**: Maintained per user with automatic cleanup
- ⚡ **Typing Indicators**: Shows processing status while working
- 🛡️ **Error Handling**: Comprehensive error handling for API limits and failures
- 🤖 **Function Calling**: Uses OpenAI's function calling feature for structured actions
- 🚚 **Real Tracking Numbers**: Generates actual DHL tracking numbers
- 📄 **PDF Label Download**: Provides PDF shipping labels as downloadable files
- 🇩🇪 **German Interface**: Bot communicates in German language

## How It Works

The bot uses OpenAI's function calling feature to:

1. **Collect Information**: Through natural conversation, the bot collects:
   - Sender address (automatically uses stored address for returning users)
   - Recipient address (validates with Google Maps API)
   - Package weight (in kilograms)

2. **Validate Addresses**: All addresses are validated using Google Maps Address Validation API

3. **Confirm Details**: Once all information is collected, the bot confirms the details

4. **Create Label**: When confirmed, creates a real DHL shipping label with tracking number

5. **Deliver PDF**: Provides the shipping label as a downloadable PDF file

6. **Reset Conversation**: Automatically resets conversation after successful label creation

### Example Conversation Flow

```
User: "Ich möchte ein Paket versenden"
Bot: "Gerne helfe ich Ihnen bei der Erstellung eines Versandetiketts! Wie lautet die Empfängeradresse?"
User: "Max Mustermann, Musterstraße 123, 12345 Berlin"
Bot: "Perfekt! Wie schwer ist das Paket?"
User: "2.5 kg"
Bot: "Lassen Sie mich die Details bestätigen:
     Von: [Ihre gespeicherte Adresse]
     An: Max Mustermann, Musterstraße 123, 12345 Berlin
     Gewicht: 2.5 kg
     Ist das korrekt?"
User: "Ja"
[Bot erstellt DHL-Versandetikett und sendet PDF]
```

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Telegram Bot Token
- OpenAI API Key
- Google Maps API Key
- DHL API Access

### 2. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow the instructions to create a bot
4. Copy the bot token

### 3. Get OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an account or sign in
3. Generate a new API key
4. Copy the API key

### 4. Get Google Maps API Key

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Address Validation API"
4. Go to "Credentials" and create an API key
5. Copy the API key

### 5. Get DHL API Access

1. Visit [DHL Developer Portal](https://developer.dhl.com/)
2. Create a developer account
3. Apply for API access to **DHL Parcel Germany API**
4. Get your client credentials (Client ID and Client Secret)
5. Set up your DHL business account credentials (username and password)
6. Obtain your DHL billing number from your DHL business account

### 6. Installation

```bash
# Clone or navigate to the project directory
cd dhlBot

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env
```

### 7. Configuration

Edit the `.env` file with your API keys:

```env
# Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Authorized User IDs (comma-separated list of Telegram user IDs)
AUTHORIZED_USERS=123456789,987654321

# OpenAI API Key from https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# OpenAI Model (e.g., gpt-3.5-turbo, gpt-4)
OPENAI_MODEL=gpt-3.5-turbo

# Google Maps API Key for address validation
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# DHL API Configuration
DHL_CLIENT_ID=your_dhl_client_id_here
DHL_CLIENT_SECRET=your_dhl_client_secret_here
DHL_USERNAME=your_dhl_username_here
DHL_PASSWORD=your_dhl_password_here
DHL_BILLING_NUMBER=your_dhl_billing_number_here
DHL_USE_SANDBOX=true
```

**Important Notes:**
- Set `DHL_USE_SANDBOX=false` for production use
- `AUTHORIZED_USERS` should contain comma-separated Telegram user IDs
- Get your Telegram user ID by messaging [@userinfobot](https://t.me/userinfobot)

### 8. Running the Bot

```bash
# Production mode
npm start

# Development mode (with auto-restart)
npm run dev
```

## Usage

1. **Start the bot**: Send `/start` to your bot on Telegram
2. **Authorization**: Only users listed in `AUTHORIZED_USERS` can use the bot
3. **Create shipping label**: Tell the bot you want to ship something
4. **Follow prompts**: Provide recipient address and package weight
5. **Confirm details**: Review and confirm the shipping information
6. **Receive label**: Get tracking number and PDF download
7. **Auto-reset**: Conversation resets automatically after label creation

## Technical Details

### Architecture

The bot is built with a modular architecture:

- **`bot.js`**: Main entry point and message handling
- **`src/database.js`**: SQLite database operations
- **`src/addressValidation.js`**: Google Maps API integration
- **`src/systemPrompt.js`**: Dynamic system prompt generation
- **`src/conversationManager.js`**: Conversation state management
- **`src/toolExecutor.js`**: OpenAI function call handling
- **`src/tools.js`**: Tool definitions for OpenAI
- **`src/dhlApi.js`**: DHL API integration

### Security Features

- **User Authorization**: Whitelist-based access control
- **Environment Variables**: Sensitive data stored in `.env` file
- **Input Validation**: All addresses validated before processing
- **Error Handling**: Graceful error handling without exposing sensitive information

### API Integration

The bot integrates with multiple APIs:

- **OpenAI Chat Completions API**: For conversational AI with function calling
- **DHL Parcel Germany API**: For creating real shipping labels
- **Google Address Validation API**: For address verification
- **Telegram Bot API**: For bot communication

### Database Schema

```sql
CREATE TABLE user_addresses (
    user_id INTEGER PRIMARY KEY,
    sender_address TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Function Calling

The bot implements three OpenAI function calls:

1. **`print_shipping_label`**: Creates DHL shipping labels
2. **`validate_address`**: Validates addresses with Google Maps
3. **`save_sender_address`**: Stores sender addresses in database

### Conversation Management

- **Memory Storage**: Conversations stored in memory (reset on restart)
- **Database Storage**: Sender addresses permanently stored in SQLite
- **Auto-cleanup**: Conversation history limited to prevent token overflow
- **Auto-reset**: Conversations reset after successful label creation

## Important Notes

### Security
- **Never commit** your `.env` file to version control
- **Restrict access** using `AUTHORIZED_USERS` environment variable
- **Use HTTPS** for production deployments
- **Regularly rotate** API keys

### Costs
- **OpenAI API**: Usage-based pricing for tokens
- **Google Maps API**: Address validation costs per request
- **DHL API**: Shipping costs apply for real labels

### Production Considerations
- Set `DHL_USE_SANDBOX=false` for production
- Use webhook mode instead of polling for production
- Consider implementing database persistence (PostgreSQL, etc.)
- Set up proper logging and monitoring

## Error Handling

The bot handles various error scenarios:

- **Invalid API keys**: Clear error messages
- **Rate limits**: Automatic retry with backoff
- **Network errors**: Graceful degradation
- **Invalid addresses**: Address validation feedback
- **Unauthorized access**: Access denied messages
- **DHL API errors**: Detailed error reporting

## Future Improvements

Potential enhancements:
- **Multiple shipping options** (Express, Standard, etc.)
- **Package dimensions** collection
- **Price calculation** before shipping
- **Tracking updates** via webhooks
- **Multiple languages** support
- **Webhook mode** for production deployment
- **Advanced analytics** and reporting
- **Bulk shipping** capabilities

## Support

For issues or questions:
1. Check the error logs in the console
2. Verify all API keys are correctly configured
3. Ensure user IDs are properly added to `AUTHORIZED_USERS`
4. Test with `DHL_USE_SANDBOX=true` first

## License

This project is licensed under the 0BSD License. 