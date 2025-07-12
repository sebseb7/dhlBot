require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

// Import our modules
const Database = require('./src/database');
const AddressValidator = require('./src/addressValidation');
const SystemPrompt = require('./src/systemPrompt');
const ConversationManager = require('./src/conversationManager');
const ToolExecutor = require('./src/toolExecutor');
const DHLApi = require('./src/dhlApi');
const tools = require('./src/tools');

// Initialize components
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const database = new Database();
const addressValidator = new AddressValidator(process.env.GOOGLE_MAPS_API_KEY);
const dhlApi = new DHLApi(
    process.env.DHL_CLIENT_ID,
    process.env.DHL_CLIENT_SECRET,
    process.env.DHL_USERNAME,
    process.env.DHL_PASSWORD,
    process.env.DHL_USE_SANDBOX === 'true'
);
const systemPrompt = new SystemPrompt(database);
const conversationManager = new ConversationManager(systemPrompt);
const toolExecutor = new ToolExecutor(database, addressValidator, bot, systemPrompt, dhlApi);

// Authorization helper
function isAuthorized(userId) {
    const authorizedUsers = process.env.AUTHORIZED_USERS;
    if (!authorizedUsers) {
        console.warn('WARNING: No AUTHORIZED_USERS defined in .env - bot is open to all users!');
        return true; // If no users defined, allow all (for development)
    }
    
    const authorizedUserIds = authorizedUsers.split(',').map(id => id.trim());
    const isAuth = authorizedUserIds.includes(userId.toString());
    
    console.log(`Authorization check for user ${userId}: ${isAuth ? 'AUTHORIZED' : 'DENIED'}`);
    return isAuth;
}

// Handle /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Check authorization
    if (!isAuthorized(userId)) {
        await bot.sendMessage(chatId, '❌ **Zugriff verweigert**\n\nSie sind nicht berechtigt, diesen Bot zu verwenden.\n\nBitte wenden Sie sich an den Administrator, um Zugriff zu erhalten.');
        return;
    }
    
    await conversationManager.startNewConversation(userId);
    
    const welcomeMessage = 'Willkommen beim DHL Versand-Bot! 📦\n\n' +
        'Ich kann Ihnen bei der Erstellung von Versandetiketten helfen.\n\n' +
        'Sagen Sie mir einfach, dass Sie etwas versenden möchten, und ich führe Sie durch den Prozess!\n\n' +
        'Befehle:\n' +
        '• Senden Sie eine Nachricht, um mit dem Versand zu beginnen\n' +
        '• Nutzen Sie die Schaltfläche unten, um eine neue Unterhaltung zu starten';
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [[
                { text: '🔄 Neue Unterhaltung starten', callback_data: 'new_conversation' }
            ]]
        }
    };
    
    bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// Handle callback queries (button presses)
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    // Check authorization
    if (!isAuthorized(userId)) {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Zugriff verweigert!' });
        return;
    }
    
    if (data === 'new_conversation') {
        await conversationManager.startNewConversation(userId);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Neue Unterhaltung gestartet!' });
        bot.sendMessage(chatId, '✨ Neue Unterhaltung gestartet! Wie kann ich Ihnen heute beim Versand helfen?');
    }
});

// Handle regular messages
bot.on('message', async (msg) => {
    // Skip if it's a command
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userMessage = msg.text;
    
    // Check authorization
    if (!isAuthorized(userId)) {
        await bot.sendMessage(chatId, '❌ **Zugriff verweigert**\n\nSie sind nicht berechtigt, diesen Bot zu verwenden.');
        return;
    }
    
    if (!userMessage) {
        bot.sendMessage(chatId, 'Bitte senden Sie eine Textnachricht.');
        return;
    }
    
    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');
    
    try {
        // Get user's conversation history
        const conversation = await conversationManager.getUserConversation(userId);
        
        // Add user's message to conversation
        conversation.push({ role: 'user', content: userMessage });
        
        // Call OpenAI API with tools
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: conversation,
            tools: tools,
            temperature: 0.7,
            user: userId.toString(),
        });
        
        const message = completion.choices[0].message;
        
        // Check if the AI wants to call a tool
        if (message.tool_calls && message.tool_calls.length > 0) {
            // Add the assistant's message with tool calls to conversation
            conversation.push(message);
            
            // Execute all tool calls and collect results
            const toolResults = [];
            for (const toolCall of message.tool_calls) {
                const result = await toolExecutor.executeToolCall(
                    toolCall, 
                    chatId, 
                    userId, 
                    conversationManager.getUserConversation.bind(conversationManager),
                    conversationManager.startNewConversation.bind(conversationManager)
                );
                
                if (result) {
                    toolResults.push(result);
                }
            }
            
            // Add all tool results to conversation
            for (const result of toolResults) {
                conversation.push({
                    role: "tool",
                    tool_call_id: result.tool_call_id,
                    content: result.output
                });
            }
            
            // Only make one follow-up call after all tools are processed
            if (toolResults.length > 0) {
                // Check if any tool result indicates completion (no follow-up needed)
                const hasCompleteResult = toolResults.some(result => 
                    result.output && result.output.startsWith('COMPLETE:')
                );
                
                if (!hasCompleteResult) {
                    const followUpCompletion = await openai.chat.completions.create({
                        model: process.env.OPENAI_MODEL,
                        messages: conversation,
                        temperature: 0.7,
                        user: userId.toString(),
                    });
                    
                    const followUpMessage = followUpCompletion.choices[0].message.content;
                    
                    // Add the follow-up message to conversation history
                    conversation.push({ role: 'assistant', content: followUpMessage });
                    
                    // Send follow-up message with "New Conversation" button
                    const keyboard = {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔄 Neue Unterhaltung starten', callback_data: 'new_conversation' }
                            ]]
                        }
                    };
                    
                    bot.sendMessage(chatId, followUpMessage, keyboard);
                }
            }
        } else {
            // Regular AI response without tool calls
            const aiResponse = message.content;
            
            // Add AI response to conversation history
            conversationManager.addMessage(userId, { role: 'assistant', content: aiResponse });
            
            // Send response with "New Conversation" button
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔄 Neue Unterhaltung starten', callback_data: 'new_conversation' }
                    ]]
                }
            };
            
            bot.sendMessage(chatId, aiResponse, keyboard);
        }
        
    } catch (error) {
        console.error('Error:', error);
        
        let errorMessage = '❌ Entschuldigung, es ist ein Fehler bei der Verarbeitung Ihrer Nachricht aufgetreten.';
        
        if (error.response?.status === 429) {
            errorMessage = '⏳ Ratenlimit überschritten. Bitte versuchen Sie es später erneut.';
        } else if (error.response?.status === 401) {
            errorMessage = '🔑 Ungültiger API-Schlüssel. Bitte überprüfen Sie Ihren OpenAI API-Schlüssel.';
        }
        
        bot.sendMessage(chatId, errorMessage);
    }
});

// Handle polling errors
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    database.close();
    process.exit(0);
});

console.log('🤖 DHL Versand-Bot läuft...'); 