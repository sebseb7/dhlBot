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
// DHL API will be initialized per user with their credentials
const systemPrompt = new SystemPrompt(database);
const conversationManager = new ConversationManager(systemPrompt);
const toolExecutor = new ToolExecutor(database, addressValidator, bot, systemPrompt);

// Set up bot commands (menu)
bot.setMyCommands([
    { command: 'start', description: 'Bot starten' },
    { command: 'new_conversation', description: '🔄 Neue Unterhaltung starten' },
    { command: 'list_shipments', description: '📋 Sendungen anzeigen' }
]).catch(console.error);

// Authorization helper - now all users are allowed, authorization is handled by initialization
function isAuthorized(userId) {
    // All users are now allowed to use the bot
    // Authorization is handled by the initialization process
    console.log(`User ${userId} access granted - authorization handled by initialization`);
    return true;
}

// Function to show shipments with cancel buttons
async function showShipmentsWithCancelButtons(chatId, userId) {
    try {
        const shipments = await database.getUserShipments(userId, 10);
        
        if (shipments.length === 0) {
            bot.sendMessage(chatId, '📦 Sie haben noch keine Sendungen erstellt.');
            return;
        }
        
        // Format shipments list
        let message = `📦 **Ihre letzten ${shipments.length} Sendungen:**\n\n`;
        
        // Create inline keyboard with cancel buttons for each shipment
        const inlineKeyboard = [];
        
        for (const shipment of shipments) {
            const date = new Date(shipment.created_at).toLocaleDateString('de-DE');
            message += `🔹 **${shipment.tracking_number}**\n`;
            message += `   📅 ${date}\n`;
            message += `   📍 An: ${shipment.recipient_address.split(',')[0]}\n`;
            message += `   ⚖️ ${shipment.weight}\n`;
            message += `   📊 Status: ${shipment.status}\n`;
            message += `\n`;
            
            // Add cancel button for each shipment (assuming they can be cancelled if status is CREATED)
            if (shipment.status === 'CREATED' || shipment.status === 'UNKNOWN') {
                inlineKeyboard.push([{
                    text: `❌ ${shipment.tracking_number} stornieren`,
                    callback_data: `cancel_shipment_${shipment.tracking_number}`
                }]);
            }
        }
        
        // Only show keyboard if there are cancel buttons to display
        if (inlineKeyboard.length === 0) {
            // No cancel buttons, send message without keyboard
            bot.sendMessage(chatId, message + `💡 **Tipp:** Alle Ihre Sendungen sind bereits verarbeitet und können nicht mehr storniert werden.`, { parse_mode: 'Markdown' });
            return;
        }
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        };
        
        message += `💡 **Tipp:** Klicken Sie auf "Stornieren" um eine Sendung zu stornieren.`;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
        
    } catch (error) {
        console.error('Error showing shipments:', error);
        bot.sendMessage(chatId, '❌ Fehler beim Laden der Sendungen.');
    }
}

// Function to handle shipment cancellation via button
async function cancelShipmentWithButton(chatId, userId, trackingNumber) {
    try {
        // Get shipment from database
        const shipment = await database.getShipmentByNumber(userId, trackingNumber);
        if (!shipment) {
            bot.sendMessage(chatId, '❌ Sendung nicht gefunden oder gehört nicht zu Ihnen.');
            return;
        }
        
        // Get user credentials for DHL API
        const userCredentials = await database.getUserCredentials(userId);
        if (!userCredentials) {
            bot.sendMessage(chatId, '❌ Keine DHL-Zugangsdaten gefunden. Bitte initialisieren Sie sich zuerst.');
            return;
        }
        
        // Create DHL API instance with user credentials
        const userDhlApi = new DHLApi(
            process.env.DHL_CLIENT_ID,
            process.env.DHL_CLIENT_SECRET,
            userCredentials.dhl_username,
            userCredentials.dhl_password,
            process.env.DHL_USE_SANDBOX === 'true',
            userCredentials.dhl_billing_number
        );
        
        // Cancel using the tracking number
        const result = await userDhlApi.cancelShipment(shipment.tracking_number);
        
        if (result.success) {
            // Remove cancelled shipment from database
            await database.deleteShipment(userId, shipment.tracking_number);
            
            bot.sendMessage(chatId, `✅ **Sendung erfolgreich storniert**\n\n**Sendungsnummer:** ${shipment.tracking_number}\n**Status:** Storniert und aus der Datenbank entfernt`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `❌ **Fehler beim Stornieren der Sendung:**\n${result.error}`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('Error canceling shipment:', error);
        bot.sendMessage(chatId, '❌ Fehler beim Stornieren der Sendung.');
    }
}

// Handle /new_conversation command
bot.onText(/\/new_conversation/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Check authorization
    if (!isAuthorized(userId)) {
        await bot.sendMessage(chatId, '❌ **Zugriff verweigert**\n\nSie sind nicht berechtigt, diesen Bot zu verwenden.');
        return;
    }
    
    await conversationManager.startNewConversation(userId);
    bot.sendMessage(chatId, '✨ Neue Unterhaltung gestartet! Wie kann ich Ihnen heute beim Versand helfen?');
});

// Handle /list_shipments command
bot.onText(/\/list_shipments/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Check authorization
    if (!isAuthorized(userId)) {
        await bot.sendMessage(chatId, '❌ **Zugriff verweigert**\n\nSie sind nicht berechtigt, diesen Bot zu verwenden.');
        return;
    }
    
    await showShipmentsWithCancelButtons(chatId, userId);
});

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
        'Verfügbare Befehle (über das Menü):\n' +
        '• /new_conversation - 🔄 Neue Unterhaltung starten\n' +
        '• /list_shipments - 📋 Sendungen anzeigen\n\n' +
        'Oder senden Sie einfach eine Nachricht, um zu beginnen!';
    
    bot.sendMessage(chatId, welcomeMessage);
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
    } else if (data === 'list_shipments') {
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Lade Sendungen...' });
        await showShipmentsWithCancelButtons(chatId, userId);
    } else if (data.startsWith('cancel_shipment_')) {
        const trackingNumber = data.replace('cancel_shipment_', '');
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Storniere Sendung...' });
        await cancelShipmentWithButton(chatId, userId, trackingNumber);
    }
});

// Handle regular messages
bot.on('message', async (msg) => {
    // Skip if it's a command
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userMessage = msg.text;
    const photo = msg.photo;
    const voice = msg.voice;
    
    // Check authorization
    if (!isAuthorized(userId)) {
        await bot.sendMessage(chatId, '❌ **Zugriff verweigert**\n\nSie sind nicht berechtigt, diesen Bot zu verwenden.');
        return;
    }
    
    // Check if message has content (text, photo, or voice)
    if (!userMessage && !photo && !voice) {
        bot.sendMessage(chatId, 'Bitte senden Sie eine Textnachricht, ein Bild oder eine Sprachnachricht.');
        return;
    }
    
    // Handle voice messages first
    if (voice) {
        try {
            // Show typing indicator for voice processing
            bot.sendChatAction(chatId, 'typing');
            
            // Get voice file stream
            const stream = bot.getFileStream(voice.file_id);
            const bufs = [];
            
            // Process voice message
            await new Promise((resolve, reject) => {
                stream.on('data', (d) => { bufs.push(d) });
                stream.on('end', async () => {
                    try {
                        // Create audio file for OpenAI
                        const audioFile = new File(bufs, "audio.ogg", {type: "audio/ogg"});
                        
                        // Transcribe using OpenAI Whisper
                        const transcriptions = await openai.audio.transcriptions.create({ 
                            file: audioFile,
                            model: "whisper-1" 
                        });
                        
                        // Send transcription to user
                        await bot.sendMessage(chatId, `🎤 **Sprachnachricht erkannt:**\n"${transcriptions.text}"`, { parse_mode: 'Markdown' });
                        
                        // Process the transcribed text as if it were a regular message
                        await processMessage(chatId, userId, transcriptions.text, null, null);
                        
                        resolve();
                    } catch (error) {
                        console.error('Error processing voice:', error);
                        await bot.sendMessage(chatId, '❌ Fehler beim Verarbeiten der Sprachnachricht. Bitte versuchen Sie es erneut.');
                        reject(error);
                    }
                });
                stream.on('error', reject);
            });
            
            return; // Exit here since voice processing is complete
        } catch (error) {
            console.error('Error handling voice message:', error);
            bot.sendMessage(chatId, '❌ Fehler beim Verarbeiten der Sprachnachricht. Bitte versuchen Sie es erneut.');
            return;
        }
    }
    
    // Process regular messages (text/image)
    await processMessage(chatId, userId, userMessage, photo, null);
});

// Function to process messages (text, images, or transcribed voice)
async function processMessage(chatId, userId, userMessage, photo, voice) {
    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');
    
    try {
        // Get user's conversation history
        const conversation = await conversationManager.getUserConversation(userId);
        
        // Prepare message content for OpenAI
        let messageContent = [];
        
        // Add text if present
        if (userMessage) {
            messageContent.push({ type: 'text', text: userMessage });
        }
        
        // Add image if present
        if (photo && photo.length > 0) {
            try {
                // Get the highest resolution photo
                const highestResPhoto = photo[photo.length - 1];
                const fileId = highestResPhoto.file_id;
                
                // Get file info from Telegram
                const file = await bot.getFile(fileId);
                const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
                
                // Download the image
                const response = await fetch(fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Image = buffer.toString('base64');
                
                // Add image to message content
                messageContent.push({ 
                    type: 'image_url', 
                    image_url: { 
                        url: 'data:image/jpeg;base64,' + base64Image 
                    } 
                });
            } catch (imageError) {
                console.error('Error processing image:', imageError);
                bot.sendMessage(chatId, '❌ Fehler beim Verarbeiten des Bildes. Bitte versuchen Sie es erneut.');
                return;
            }
        }
        
        // Add user's message to conversation
        conversation.push({ role: 'user', content: messageContent });
        
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
                    
                    // Send follow-up message
                    bot.sendMessage(chatId, followUpMessage, { parse_mode: 'Markdown' });
                }
            }
        } else {
            // Regular AI response without tool calls
            const aiResponse = message.content;
            
            // Add AI response to conversation history
            conversationManager.addMessage(userId, { role: 'assistant', content: aiResponse });
            
            // Send response
            bot.sendMessage(chatId, aiResponse, { parse_mode: 'Markdown' });
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
}

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