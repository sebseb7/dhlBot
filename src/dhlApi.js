const axios = require('axios');

class DHLApi {
    constructor(clientId, clientSecret, username, password, useSandbox = false) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.username = username;
        this.password = password;
        this.baseUrl = useSandbox ? 'https://api-sandbox.dhl.com' : 'https://api-eu.dhl.com';
        this.accessToken = null;
        this.tokenExpiry = null;
        this.basicAuthCredentials = null;
    }

    async authenticate() {
        try {
            // Use the correct OAuth2 endpoint with proper formatting
            const response = await axios.post(
                `${this.baseUrl}/parcel/de/account/auth/ropc/v1/token`,
                `grant_type=password&username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}`,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json'
                    }
                }
            );

            const data = response.data;
            this.accessToken = data.access_token;
            // Set token expiry (usually expires_in is in seconds)
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);
            
            console.log('DHL API authentication successful');
            return true;
        } catch (error) {
            console.error('DHL API authentication failed:', error.response?.data || error.message);
            
            // If OAuth2 fails, try Basic Auth as fallback (still supported in sandbox)
            console.log('Attempting Basic Auth fallback...');
            try {
                // For sandbox, we can use Basic Auth as documented
                const basicAuthCredentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
                
                // Test basic auth by making a simple API call
                const testResponse = await axios.get(`${this.baseUrl}/parcel/de/shipping/v2/`, {
                    headers: {
                        'Authorization': `Basic ${basicAuthCredentials}`,
                        'dhl-api-key': this.clientId,
                        'Accept': 'application/json'
                    }
                });
                
                // If basic auth works, store credentials for API calls
                this.basicAuthCredentials = basicAuthCredentials;
                this.accessToken = null; // Clear OAuth token
                this.tokenExpiry = null; // Clear token expiry
                console.log('DHL API Basic Auth fallback successful');
                return true;
            } catch (basicAuthError) {
                console.error('Basic Auth fallback also failed:', basicAuthError.response?.data || basicAuthError.message);
                return false;
            }
        }
    }

    async ensureAuthenticated() {
        // If using OAuth2, check token expiry
        if (this.accessToken && Date.now() >= this.tokenExpiry) {
            console.log('Access token expired, re-authenticating...');
            // Clear expired token before re-authenticating
            this.accessToken = null;
            this.tokenExpiry = null;
        }
        
        // If no authentication credentials at all, authenticate
        if (!this.accessToken && !this.basicAuthCredentials) {
            console.log('No authentication credentials, authenticating...');
            const success = await this.authenticate();
            if (!success) {
                console.error('Authentication failed completely');
                return false;
            }
        }
        
        console.log('Authentication valid');
        return true;
    }

    parseAddress(addressString) {
        console.log('=== DEBUG: DHL Address Parsing ===');
        console.log('Input Address String:', addressString);
        
        // Handle both newline-separated and comma-separated addresses
        let lines;
        if (addressString.includes('\n')) {
            // Multi-line address (traditional format)
            lines = addressString.split('\n').map(line => line.trim()).filter(line => line);
        } else {
            // Single-line address (Google validation format) - split by comma
            lines = addressString.split(',').map(line => line.trim()).filter(line => line);
        }
        
        console.log('Address Lines:', lines);
        
        if (lines.length < 3) {
            console.log('ERROR: Address has insufficient components:', lines.length);
            throw new Error('Adresse unvollständig. Benötigt mindestens Name, Straße und Ort.');
        }

        // For comma-separated addresses (Google format):
        // "Growheads, Max Schön, Trachenberger Straße 14, 01129 Dresden, Deutschland"
        // We need to intelligently parse this
        
        let name, street, postalCode, city, country;
        
        if (lines.length >= 4) {
            // Try to identify postal code + city pattern
            let postalCityIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\d{5}\s+/)) {
                    postalCityIndex = i;
                    break;
                }
            }
            
            if (postalCityIndex > 0) {
                // Found postal code pattern
                name = lines.slice(0, postalCityIndex - 1).join(', ');
                street = lines[postalCityIndex - 1];
                
                const postalMatch = lines[postalCityIndex].match(/^(\d{5})\s+(.+)$/);
                if (postalMatch) {
                    postalCode = postalMatch[1];
                    city = postalMatch[2];
                } else {
                    postalCode = lines[postalCityIndex].match(/\d{5}/)[0];
                    city = lines[postalCityIndex].replace(/^\d{5}\s*/, '');
                }
                
                country = lines[postalCityIndex + 1] || 'DE';
            } else {
                // Fallback: assume last component is country, second-to-last is city+postal
                name = lines[0];
                street = lines[1];
                const cityLine = lines[lines.length - 2];
                country = lines[lines.length - 1];
                
                const postalMatch = cityLine.match(/(\d{5})\s+(.+)/);
                if (postalMatch) {
                    postalCode = postalMatch[1];
                    city = postalMatch[2];
                } else {
                    throw new Error('Postleitzahl und Ort konnten nicht erkannt werden.');
                }
            }
        } else {
            // Traditional format with 3 lines
            name = lines[0];
            street = lines[1];
            const cityLine = lines[2];
            
            const postalMatch = cityLine.match(/(\d{5})\s+(.+)/);
            if (postalMatch) {
                postalCode = postalMatch[1];
                city = postalMatch[2];
            } else {
                throw new Error('Postleitzahl und Ort konnten nicht erkannt werden.');
            }
            country = 'DE';
        }
        
        console.log('Parsed Components:');
        console.log('- Name:', name);
        console.log('- Street:', street);
        console.log('- Postal Code:', postalCode);
        console.log('- City:', city);
        console.log('- Country:', country);

        const result = {
            name: name,
            street: street,
            postalCode: postalCode,
            city: city,
            country: country === 'Deutschland' ? 'DE' : country
        };
        
        console.log('Final Parsed Address:', result);
        console.log('================================');
        
        return result;
    }

    async createShippingLabel(fromAddress, toAddress, weight) {
        console.log('=== DEBUG: DHL Shipping Label Creation ===');
        console.log('From Address:', fromAddress);
        console.log('To Address:', toAddress);
        console.log('Weight:', weight);
        
        if (!await this.ensureAuthenticated()) {
            throw new Error('DHL API Authentifizierung fehlgeschlagen');
        }

        try {
            // Parse addresses
            const sender = this.parseAddress(fromAddress);
            const recipient = this.parseAddress(toAddress);
            
            // Parse weight (extract number)
            const weightMatch = weight.match(/(\d+(?:\.\d+)?)/);
            const weightInKg = weightMatch ? parseFloat(weightMatch[1]) : 1.0;
            
            console.log('Parsed Weight:', weightInKg, 'kg');

            // Create shipment request based on working example
            const shipmentData = {
                "profile": "STANDARD_GRUPPENPROFIL",
                "shipments": [{
                    "product": "V01PAK",
                    "billingNumber": process.env.DHL_BILLING_NUMBER,
                    "refNo": `BOT-${Date.now()}`,
                    "shipper": {
                        "name1": sender.name,
                        "addressStreet": sender.street,
                        "postalCode": sender.postalCode,
                        "city": sender.city,
                        "country": "DEU" // Use DEU instead of DE
                    },
                    "consignee": {
                        "name1": recipient.name,
                        "addressStreet": recipient.street,
                        "postalCode": recipient.postalCode,
                        "city": recipient.city,
                        "country": "DEU" // Use DEU instead of DE
                    },
                    "details": {
                        "weight": {
                            "uom": "g", // Use grams instead of kg
                            "value": Math.round(weightInKg * 1000) // Convert kg to grams
                        }
                    }
                }]
            };
            
            console.log('DHL Shipment Data:', JSON.stringify(shipmentData, null, 2));

            // Prepare headers based on authentication method
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Language': 'de-DE'
            };
            
            console.log('Authentication state:');
            console.log('- Access Token:', this.accessToken ? 'Present' : 'None');
            console.log('- Basic Auth Credentials:', this.basicAuthCredentials ? 'Present' : 'None');
            console.log('- Token Expiry:', this.tokenExpiry);
            
            if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
                console.log('Using Bearer Token authentication');
            } else if (this.basicAuthCredentials) {
                headers['Authorization'] = `Basic ${this.basicAuthCredentials}`;
                headers['dhl-api-key'] = this.clientId; // API key required for Basic Auth
                console.log('Using Basic Auth authentication with API key');
            } else {
                throw new Error('No valid authentication credentials available');
            }
            
            console.log('Request Headers:', JSON.stringify(headers, null, 2));

            console.log('Sending request to DHL API...');
            const response = await axios.post(
                `${this.baseUrl}/parcel/de/shipping/v2/orders?docFormat=PDF&printFormat=910-300-400`,
                shipmentData,
                { headers }
            );

            console.log('DHL API Response Status:', response.status);
            console.log('DHL API Response Data:', JSON.stringify(response.data, null, 2));
            
            const result = response.data;
            
            if (result.items && result.items.length > 0) {
                const shipment = result.items[0];
                
                // Log all available identifiers for debugging
                console.log('=== Available Shipment Identifiers ===');
                console.log('shipmentNo:', shipment.shipmentNo);
                console.log('sstNo:', shipment.sstNo);
                console.log('refNo:', shipment.refNo);
                console.log('All shipment fields:', Object.keys(shipment));
                console.log('Full shipment object:', JSON.stringify(shipment, null, 2));
                console.log('======================================');
                
                const labelResult = {
                    success: true,
                    trackingNumber: shipment.shipmentNo,
                    referenceNumber: shipment.shipmentRefNo,
                    labelUrl: shipment.label?.url || shipment.label?.b64,
                    shipmentData: shipment
                };
                
                console.log('Label creation successful:', labelResult);
                console.log('==========================================');
                
                return labelResult;
            } else {
                console.log('ERROR: No shipment data in response');
                console.log('Full response:', JSON.stringify(result, null, 2));
                throw new Error('Keine Sendungsdaten in der Antwort erhalten');
            }

        } catch (error) {
            console.error('=== DEBUG: DHL API Error ===');
            console.error('Error Status:', error.response?.status);
            console.error('Error Headers:', error.response?.headers);
            console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
            console.error('Error Message:', error.message);
            console.error('Full Error:', error);
            console.error('=============================');
            
            throw new Error(`DHL Versandetikett konnte nicht erstellt werden: ${error.response?.data?.detail || error.message}`);
        }
    }

    async getShipmentStatus(shipmentNumber) {
        console.log('=== DEBUG: DHL Get Shipment Status ===');
        console.log('Shipment Number:', shipmentNumber);
        
        try {
            await this.ensureAuthenticated();
            
            const headers = {
                'Accept': 'application/json',
                'Accept-Language': 'de-DE'
            };
            
            if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
            } else if (this.basicAuthCredentials) {
                headers['Authorization'] = `Basic ${this.basicAuthCredentials}`;
                headers['dhl-api-key'] = this.clientId;
            }
            
            // Use query parameter format consistent with cancellation endpoint
            const statusUrl = `${this.baseUrl}/parcel/de/shipping/v2/orders?shipment=${shipmentNumber}`;
            console.log('Status URL:', statusUrl);
            
            const response = await axios.get(statusUrl, { headers });
            
            console.log('Shipment Status Response:', JSON.stringify(response.data, null, 2));
            
            // Handle status which might be an object or string
            let status = 'UNKNOWN';
            let shipmentState = 'UNKNOWN';
            
            // Look for status in different possible locations in the response
            if (response.data.items && response.data.items.length > 0) {
                const shipment = response.data.items[0];
                status = shipment.status || shipment.shipmentStatus || 'UNKNOWN';
                shipmentState = shipment.state || shipment.shipmentState || status;
            } else if (response.data.status) {
                if (typeof response.data.status === 'string') {
                    status = response.data.status;
                } else if (typeof response.data.status === 'object') {
                    // Status might be an object with properties like { statusCode: 'CREATED', description: '...' }
                    status = response.data.status.statusCode || response.data.status.code || response.data.status.value || JSON.stringify(response.data.status);
                }
                shipmentState = status;
            } else {
                // If no status found, use the HTTP status code as fallback (but this is wrong)
                status = `HTTP_${response.status}`;
                shipmentState = status;
            }
            
            console.log('Extracted status:', status, 'Shipment state:', shipmentState, 'Types:', typeof status, typeof shipmentState);
            const statusUpper = typeof status === 'string' ? status.toUpperCase() : 'UNKNOWN';
            
            return {
                success: true,
                data: response.data,
                status: status,
                state: shipmentState,
                canCancel: status && typeof status === 'string' && !['MANIFESTED', 'DELIVERED', 'IN_TRANSIT'].includes(statusUpper)
            };
            
        } catch (error) {
            console.error('=== DEBUG: DHL Get Shipment Status Error ===');
            console.error('Error Status:', error.response?.status);
            console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
            console.error('Error Message:', error.message);
            console.error('==============================================');
            
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                status: 'ERROR'
            };
        }
    }

    async cancelShipment(shipmentNumber) {
        console.log('=== DEBUG: DHL Cancel Shipment ===');
        console.log('Shipment Number:', shipmentNumber);
        
        if (!await this.ensureAuthenticated()) {
            throw new Error('DHL API Authentifizierung fehlgeschlagen');
        }
        
        try {
            // Based on DHL API documentation, the cancellation endpoint expects the shipment reference
            // Let's try different approaches to find the correct identifier
            
            // Prepare headers based on authentication method (Content-Type required even for DELETE)
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Language': 'de-DE'
            };
            
            console.log('=== Step 1: Preparing cancellation request ===');
            console.log('Authentication state:');
            console.log('- Access Token:', this.accessToken ? 'Present' : 'None');
            console.log('- Basic Auth Credentials:', this.basicAuthCredentials ? 'Present' : 'None');
            console.log('- Token Expiry:', this.tokenExpiry);
            
            if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
                console.log('Using Bearer Token authentication with API key');
            } else if (this.basicAuthCredentials) {
                headers['Authorization'] = `Basic ${this.basicAuthCredentials}`;
                headers['dhl-api-key'] = this.clientId; // API key required for Basic Auth
                console.log('Using Basic Auth authentication with API key');
            } else {
                throw new Error('No valid authentication credentials available');
            }
            
            console.log('Request Headers:', JSON.stringify(headers, null, 2));
            
            // The DHL API cancellation endpoint uses query parameter format: /orders?shipment={shipmentNumber}
            console.log('=== Step 2: Sending DELETE request ===');
            const deleteUrl = `${this.baseUrl}/parcel/de/shipping/v2/orders?shipment=${shipmentNumber}`;
            console.log('URL:', deleteUrl);
            console.log('Request config:', JSON.stringify({ 
                method: 'DELETE',
                url: deleteUrl,
                headers: headers,
                timeout: 30000
            }, null, 2));
            
            const response = await axios.delete(deleteUrl, { headers });
            
            console.log('DHL API Response Status:', response.status);
            console.log('Cancel Shipment Response:', JSON.stringify(response.data, null, 2));
            
            return {
                success: true,
                message: 'Sendung wurde erfolgreich storniert',
                data: response.data
            };
            
        } catch (error) {
            console.error('=== DEBUG: DHL Cancel Shipment Error ===');
            console.error('Error Status:', error.response?.status);
            console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
            console.error('Error Message:', error.message);
            console.error('==========================================');
            
            let errorMessage = error.response?.data?.detail || error.message;
            
            // Provide specific error messages for common cancellation issues without making assumptions
            if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'Berechtigung verweigert - Sendung kann nicht storniert werden';
            } else if (error.response?.status === 404) {
                errorMessage = 'Sendung nicht gefunden - möglicherweise bereits storniert oder ungültige Sendungsnummer';
            } else if (error.response?.status === 409) {
                errorMessage = 'Sendung kann nicht storniert werden - möglicherweise bereits manifestiert oder verarbeitet';
            }
            
            return {
                success: false,
                error: errorMessage,
                message: 'Sendung konnte nicht storniert werden'
            };
        }
    }
}

module.exports = DHLApi; 