class ToolExecutor {
    constructor(database, addressValidator, bot, systemPrompt, dhlApi) {
        this.database = database;
        this.addressValidator = addressValidator;
        this.bot = bot;
        this.systemPrompt = systemPrompt;
        this.dhlApi = dhlApi;
    }

    async executeToolCall(toolCall, chatId, userId, getUserConversation, startNewConversation) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        if (functionName === 'issue_shipping_label') {
            return await this.handleIssueShippingLabel(toolCall, chatId, userId, functionArgs, startNewConversation);
        }
        
        if (functionName === 'validate_address') {
            return await this.handleValidateAddress(toolCall, chatId, userId, functionArgs);
        }
        
        if (functionName === 'save_sender_address') {
            return await this.handleSaveSenderAddress(toolCall, chatId, userId, functionArgs, getUserConversation);
        }
        
        if (functionName === 'check_shipment_status') {
            return await this.handleCheckShipmentStatus(toolCall, chatId, userId, functionArgs);
        }
        
        if (functionName === 'cancel_shipment') {
            return await this.handleCancelShipment(toolCall, chatId, userId, functionArgs);
        }
        
        if (functionName === 'list_user_shipments') {
            return await this.handleListUserShipments(toolCall, chatId, userId, functionArgs);
        }
        
        return {
            tool_call_id: toolCall.id,
            output: "Unbekannte Funktion: " + functionName
        };
    }

    async handleIssueShippingLabel(toolCall, chatId, userId, functionArgs, startNewConversation) {
        try {
            // Send initial processing message
            await this.bot.sendMessage(chatId, '🔄 Versandetikett wird erstellt...');
            
            // Create real DHL shipping label
            const dhlResult = await this.dhlApi.createShippingLabel(
                functionArgs.from_address,
                functionArgs.to_address,
                functionArgs.weight
            );
            
            // Format the label information with real DHL data
            const labelInfo = `
📦 **VERSANDETIKETT ERFOLGREICH ERSTELLT** 📦

**Absenderadresse:**
${functionArgs.from_address}

**Empfängeradresse:**
${functionArgs.to_address}

**Gewicht:** ${functionArgs.weight}

**DHL Sendungsnummer:** ${dhlResult.trackingNumber}

**Referenz:** ${dhlResult.shipmentData.refNo}

✅ Etikett wurde erstellt und ist bereit zum Download!
            `;
            
            // Send the label information
            await this.bot.sendMessage(chatId, labelInfo, { parse_mode: 'Markdown' });
            
            // Handle PDF label data
            if (dhlResult.labelUrl) {
                // Check if it's a URL or base64 data
                if (dhlResult.labelUrl.startsWith('http')) {
                    // It's a URL - send it directly
                    await this.bot.sendMessage(chatId, `📄 **Versandetikett herunterladen:**\n${dhlResult.labelUrl}\n\n💡 Das Etikett ist als PDF verfügbar und kann direkt gedruckt werden.`);
                } else {
                    // It's base64 data - convert to buffer and send as document
                    try {
                        const pdfBuffer = Buffer.from(dhlResult.labelUrl, 'base64');
                        await this.bot.sendDocument(chatId, pdfBuffer, {
                            caption: '📄 Versandetikett (PDF)',
                            filename: `DHL_Label_${dhlResult.trackingNumber}.pdf`
                        });
                    } catch (pdfError) {
                        console.error('Error sending PDF:', pdfError);
                        await this.bot.sendMessage(chatId, '📄 Etikett wurde erstellt, aber konnte nicht als PDF gesendet werden. Bitte kontaktieren Sie den Support.');
                    }
                }
            }
            
            // Reset conversation after successful label creation
            await startNewConversation(userId);
            
            // Save shipment to database for future reference
            try {
                await this.database.saveShipment(
                    userId,
                    dhlResult.trackingNumber,
                    dhlResult.referenceNumber,
                    functionArgs.from_address,
                    functionArgs.to_address,
                    functionArgs.weight
                );
                console.log('Shipment saved to database:', dhlResult.trackingNumber);
            } catch (dbError) {
                console.error('Error saving shipment to database:', dbError);
                // Don't fail the whole operation if database save fails
            }
            
            // Return success message for the AI
            return {
                tool_call_id: toolCall.id,
                output: `Versandetikett erfolgreich erstellt. DHL Sendungsnummer: ${dhlResult.trackingNumber}. Unterhaltung wurde zurückgesetzt.`
            };
            
        } catch (error) {
            console.error('Error creating DHL shipping label:', error);
            
            // Send error message to user
            await this.bot.sendMessage(chatId, `❌ **Fehler beim Erstellen des Versandetiketts:**\n\n${error.message}\n\nBitte überprüfen Sie die Adressdaten und versuchen Sie es erneut.`);
            
            // Return error message for the AI
            return {
                tool_call_id: toolCall.id,
                output: `Fehler beim Erstellen des Versandetiketts: ${error.message}`
            };
        }
    }

    async handleValidateAddress(toolCall, chatId, userId, functionArgs) {
        console.log('=== DEBUG: Address Validation Request ===');
        console.log('User ID:', userId);
        console.log('Address Type:', functionArgs.address_type);
        console.log('Address to Validate:', functionArgs.address);
        console.log('========================================');
        
        // Validate the address using Google API
        const validationResult = await this.addressValidator.validateAddress(functionArgs.address);
        
        console.log('=== DEBUG: Validation Result Summary ===');
        console.log('Is Valid:', validationResult.isValid);
        console.log('Confidence:', validationResult.confidence);
        console.log('Has Error:', !!validationResult.error);
        console.log('Error Message:', validationResult.error || 'None');
        console.log('======================================');
        
        let responseMessage = '';
        let toolOutput = '';
        
        if (validationResult.isValid) {
            responseMessage = `✅ Adresse wurde erfolgreich validiert!\n\n**Validierte Adresse:**\n${validationResult.formattedAddress}\n\n**Vertrauensstufe:** ${validationResult.confidence}`;
            toolOutput = `Adresse erfolgreich validiert. Formatierte Adresse: ${validationResult.formattedAddress}. Vertrauensstufe: ${validationResult.confidence}`;
        } else {
            // Check if it's an API error
            if (validationResult.confidence === 'VALIDATION_FAILED') {
                responseMessage = `❌ Adressvalidierung fehlgeschlagen!\n\n**Grund:** ${validationResult.error}\n\n**Eingegebene Adresse:**\n${functionArgs.address}\n\n⚠️ Die Adresse konnte nicht validiert werden. Bitte überprüfen Sie Ihre Eingabe oder verwenden Sie die Adresse auf eigene Verantwortung.`;
                toolOutput = `Adressvalidierung fehlgeschlagen aufgrund von API-Fehler: ${validationResult.error}. Benutzer sollte die Adresse überprüfen.`;
            } else {
                responseMessage = `⚠️ Adresse konnte nicht vollständig validiert werden:\n\n**Eingegebene Adresse:**\n${functionArgs.address}\n\n**Mögliche Probleme:** Adresse unvollständig oder nicht gefunden.\n\nMöchten Sie die Adresse korrigieren oder trotzdem verwenden?`;
                toolOutput = `Adresse konnte nicht validiert werden. Möglicherweise unvollständig oder nicht gefunden. Benutzer sollte die Adresse überprüfen.`;
            }
        }
        
        await this.bot.sendMessage(chatId, responseMessage);
        
        return {
            tool_call_id: toolCall.id,
            output: toolOutput
        };
    }

    async handleSaveSenderAddress(toolCall, chatId, userId, functionArgs, getUserConversation) {
        try {
            // Store the sender address permanently in database
            await this.database.saveSenderAddress(userId, functionArgs.address);
            
            // Send confirmation message
            await this.bot.sendMessage(chatId, `✅ Absenderadresse wurde gespeichert:\n${functionArgs.address}\n\nDiese Adresse wird für zukünftige Sendungen verwendet.`);
            
            // Update the conversation with new system prompt that includes the saved address
            const conversation = await getUserConversation(userId);
            const updatedSystemPrompt = await this.systemPrompt.getSystemPrompt(userId);
            conversation[0] = { role: 'system', content: updatedSystemPrompt };
            
            // Debug log: Address saved
            console.log('=== DEBUG: Address Saved ===');
            console.log('User ID:', userId);
            console.log('Saved Address:', functionArgs.address);
            console.log('===========================');
            
            // Return success message for the AI
            return {
                tool_call_id: toolCall.id,
                output: "Absenderadresse wurde erfolgreich gespeichert und wird für zukünftige Sendungen verwendet."
            };
        } catch (error) {
            console.error('Error saving address:', error);
            await this.bot.sendMessage(chatId, '❌ Fehler beim Speichern der Adresse. Bitte versuchen Sie es erneut.');
            return {
                tool_call_id: toolCall.id,
                output: "Fehler beim Speichern der Absenderadresse."
            };
        }
    }

    async handleCheckShipmentStatus(toolCall, chatId, userId, functionArgs) {
        try {
            // Send initial processing message
            await this.bot.sendMessage(chatId, '🔍 Überprüfe Sendungsstatus...');
            
            // Get shipment status from DHL API
            const result = await this.dhlApi.getShipmentStatus(functionArgs.shipment_number);
            
            if (result.success) {
                // Update status in database
                await this.database.updateShipmentStatus(userId, functionArgs.shipment_number, result.status);
                
                // Format status message
                let statusMessage = `📦 **Sendungsstatus für ${functionArgs.shipment_number}:**\n\n`;
                statusMessage += `**Status:** ${result.status}\n`;
                
                if (result.state && result.state !== result.status) {
                    statusMessage += `**Zustand:** ${result.state}\n`;
                }
                
                if (result.data.trackingNumber) {
                    statusMessage += `**Tracking:** ${result.data.trackingNumber}\n`;
                }
                
                if (result.canCancel) {
                    statusMessage += `\n✅ **Stornierung möglich**\n`;
                    statusMessage += `Diese Sendung kann noch storniert werden.`;
                } else {
                    statusMessage += `\n❌ **Stornierung nicht möglich**\n`;
                    statusMessage += `Diese Sendung kann nicht mehr storniert werden.`;
                }
                
                await this.bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
                
                return {
                    tool_call_id: toolCall.id,
                    output: `Sendungsstatus erfolgreich abgerufen: ${result.status}. Stornierung ${result.canCancel ? 'möglich' : 'nicht möglich'}.`
                };
            } else {
                await this.bot.sendMessage(chatId, `❌ **Fehler beim Abrufen des Sendungsstatus:**\n${result.error}`);
                
                return {
                    tool_call_id: toolCall.id,
                    output: `Fehler beim Abrufen des Sendungsstatus: ${result.error}`
                };
            }
        } catch (error) {
            console.error('Error checking shipment status:', error);
            await this.bot.sendMessage(chatId, '❌ Fehler beim Überprüfen des Sendungsstatus.');
            
            return {
                tool_call_id: toolCall.id,
                output: "Fehler beim Überprüfen des Sendungsstatus."
            };
        }
    }

    async handleCancelShipment(toolCall, chatId, userId, functionArgs) {
        try {
            // Send initial processing message
            await this.bot.sendMessage(chatId, '🔄 Storniere Sendung...');
            
            // Get shipment from database using tracking number
            const shipment = await this.database.getShipmentByNumber(userId, functionArgs.shipment_number);
            if (!shipment) {
                await this.bot.sendMessage(chatId, '❌ Sendung nicht gefunden oder gehört nicht zu Ihnen.');
                return {
                    tool_call_id: toolCall.id,
                    output: "Sendung nicht gefunden oder gehört nicht zum Benutzer."
                };
            }
            
            console.log('=== DEBUG: Cancellation Info ===');
            console.log('User provided tracking number:', functionArgs.shipment_number);
            console.log('Using tracking number for cancellation:', shipment.tracking_number);
            console.log('================================');
            
            // Cancel using the tracking number (shipment number as per DHL API documentation)
            const result = await this.dhlApi.cancelShipment(shipment.tracking_number);
            
            if (result.success) {
                // Remove cancelled shipment from database
                await this.database.deleteShipment(userId, shipment.tracking_number);
                
                await this.bot.sendMessage(chatId, `✅ **Sendung erfolgreich storniert**\n\n**Sendungsnummer:** ${shipment.tracking_number}\n**Status:** Storniert und aus der Datenbank entfernt`, { parse_mode: 'Markdown' });
                
                return {
                    tool_call_id: toolCall.id,
                    output: `Sendung ${shipment.tracking_number} wurde erfolgreich storniert und aus der Datenbank entfernt.`
                };
            } else {
                await this.bot.sendMessage(chatId, `❌ **Fehler beim Stornieren der Sendung:**\n${result.error}`);
                
                return {
                    tool_call_id: toolCall.id,
                    output: `Fehler beim Stornieren der Sendung: ${result.error}`
                };
            }
        } catch (error) {
            console.error('Error canceling shipment:', error);
            await this.bot.sendMessage(chatId, '❌ Fehler beim Stornieren der Sendung.');
            
            return {
                tool_call_id: toolCall.id,
                output: "Fehler beim Stornieren der Sendung."
            };
        }
    }

    async handleListUserShipments(toolCall, chatId, userId, functionArgs) {
        try {
            // Send initial processing message
            await this.bot.sendMessage(chatId, '📋 Lade Ihre Sendungen...');
            
            const limit = functionArgs.limit || 10;
            const shipments = await this.database.getUserShipments(userId, limit);
            
            if (shipments.length === 0) {
                await this.bot.sendMessage(chatId, '📦 Sie haben noch keine Sendungen erstellt.');
                            return {
                tool_call_id: toolCall.id,
                output: "COMPLETE: Keine Sendungen gefunden."
            };
            }
            
            // Format shipments list
            let message = `📦 **Ihre letzten ${shipments.length} Sendungen:**\n\n`;
            
            for (const shipment of shipments) {
                const date = new Date(shipment.created_at).toLocaleDateString('de-DE');
                message += `🔹 **${shipment.tracking_number}**\n`;
                message += `   📅 ${date}\n`;
                message += `   📍 An: ${shipment.recipient_address.split(',')[0]}\n`;
                message += `   ⚖️ ${shipment.weight}\n`;
                message += `   📊 Status: ${shipment.status}\n`;
                message += `\n`;
            }
            
            message += `💡 **Tipp:** Sie können den Status einer Sendung überprüfen oder sie stornieren, indem Sie nach der Sendungsnummer fragen.`;
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            
            return {
                tool_call_id: toolCall.id,
                output: `COMPLETE: ${shipments.length} Sendungen für den Benutzer gefunden und angezeigt.`
            };
        } catch (error) {
            console.error('Error listing user shipments:', error);
            await this.bot.sendMessage(chatId, '❌ Fehler beim Laden der Sendungen.');
            
            return {
                tool_call_id: toolCall.id,
                output: "Fehler beim Laden der Sendungen."
            };
        }
    }
}

module.exports = ToolExecutor; 