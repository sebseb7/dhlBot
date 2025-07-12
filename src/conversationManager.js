class ConversationManager {
    constructor(systemPrompt) {
        this.systemPrompt = systemPrompt;
        this.userConversations = new Map();
        this.userShippingData = new Map();
    }

    // Function to get or create user conversation
    async getUserConversation(userId) {
        if (!this.userConversations.has(userId)) {
            const systemPrompt = await this.systemPrompt.getSystemPrompt(userId);
            this.userConversations.set(userId, [
                { role: 'system', content: systemPrompt }
            ]);
        }
        return this.userConversations.get(userId);
    }

    // Function to start a new conversation
    async startNewConversation(userId) {
        const systemPrompt = await this.systemPrompt.getSystemPrompt(userId);
        this.userConversations.set(userId, [
            { role: 'system', content: systemPrompt }
        ]);
        // Clear any shipping data
        this.userShippingData.delete(userId);
    }

    // Function to add message to conversation
    addMessage(userId, message) {
        const conversation = this.userConversations.get(userId);
        if (conversation) {
            conversation.push(message);
            
            // Keep conversation history limited to prevent token overflow
            // Keep system message + last 20 messages
            if (conversation.length > 21) {
                const systemMessage = conversation[0];
                conversation.splice(0, conversation.length - 20);
                conversation.unshift(systemMessage);
            }
        }
    }

    // Function to get shipping data for user
    getShippingData(userId) {
        return this.userShippingData.get(userId);
    }

    // Function to set shipping data for user
    setShippingData(userId, data) {
        this.userShippingData.set(userId, data);
    }

    // Function to clear shipping data for user
    clearShippingData(userId) {
        this.userShippingData.delete(userId);
    }
}

module.exports = ConversationManager; 